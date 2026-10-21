import { createHash, randomBytes, randomUUID } from "node:crypto";
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import {
  canConfirmNewsletter,
  companySettingsSchema,
  emailSettingsSchema,
  normalizeEmail,
  subscribeNewsletterSchema,
  NEWSLETTER_NOTICE,
  MEASUREMENT_NOTICE,
  NEWSLETTER_NOTICE_VERSION,
  renderEmail,
} from "@daedalus/shared";
import { db } from "../admin.js";
import { requireAdmin } from "../lib/auth.js";
import { storeBaseUrl } from "../config.js";
import { enqueueEmail } from "./outbox.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export async function emailContext() {
  const [companySnap, settingsSnap] = await db.getAll(
    db.doc("settings/company"),
    db.doc("settings/email"),
  );
  const company = companySettingsSchema.parse(companySnap.data());
  return {
    company,
    settings: emailSettingsSchema.parse(settingsSnap.data() ?? {}),
    base: (company.siteUrl || storeBaseUrl.value()).replace(/\/$/, ""),
  };
}
async function requestSubscription(email: string, measurement: boolean, source: string) {
  const normalized = normalizeEmail(email);
  const index = db.doc(`emailContactIndex/${hash(normalized)}`);
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const contactId = await db.runTransaction(async (tx) => {
    const existing = await tx.get(index);
    const id = existing.get("contactId") ?? randomUUID();
    const ref = db.doc(`emailContacts/${id}`);
    const snap = await tx.get(ref);
    if (
      snap.get("status") === "confirmed" ||
      snap.get("suppression") ||
      now - (snap.get("confirmationSentAt") ?? 0) < 600000
    )
      return null;
    const generation = randomUUID();
    if (!existing.exists) tx.create(index, { contactId: id });
    tx.set(
      ref,
      {
        email: normalized,
        status: "pending",
        expiresAt: new Date(now + 30 * 86400000),
        requestedMeasurement: measurement,
        source,
        generation,
        confirmationSentAt: now,
        updatedAt: new Date(now).toISOString(),
        ...(!snap.exists ? { createdAt: new Date(now).toISOString() } : {}),
      },
      { merge: true },
    );
    tx.create(db.doc(`emailTokens/${hash(token)}`), {
      contactId: id,
      generation,
      purpose: "confirm",
      newsletterNotice: NEWSLETTER_NOTICE,
      measurementNotice: MEASUREMENT_NOTICE,
      noticeVersion: NEWSLETTER_NOTICE_VERSION,
      expiresAt: new Date(now + 48 * 3600000),
    });
    tx.create(db.collection("emailConsentEvents").doc(), {
      contactId: id,
      action: "requested",
      purpose: "newsletter",
      notice: NEWSLETTER_NOTICE,
      measurementNotice: MEASUREMENT_NOTICE,
      measurement,
      version: NEWSLETTER_NOTICE_VERSION,
      source,
      at: new Date(now).toISOString(),
    });
    return id as string;
  });
  if (!contactId) return;
  const { company, settings, base } = await emailContext();
  const content = {
    subject: "Confirm your newsletter subscription",
    preheader: "One last step to join the newsletter",
    blocks: [
      {
        type: "paragraph" as const,
        text: "Please confirm that you requested our newsletter. If you did not request this, ignore this email.",
      },
      {
        type: "button" as const,
        text: "Review and confirm",
        url: `${base}/newsletter?token=${token}&action=confirm`,
      },
    ],
  };
  const rendered = renderEmail({ content, company, settings });
  await enqueueEmail(`doi:${hash(token)}`, {
    to: normalized,
    ...rendered,
    subject: content.subject,
    kind: "confirmation",
    contactId,
    senderName: settings.senderName || company.storefrontName || company.legalName,
    replyTo: settings.replyTo || company.contactEmail,
  });
}
export const subscribeNewsletter = onRequest({ cors: true }, async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const input = subscribeNewsletterSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Check your email and consent" });
    return;
  }
  if (input.data.website) {
    res.json({ ok: true });
    return;
  }
  try {
    const key = hash(`${req.ip ?? "unknown"}:${new Date().toISOString().slice(0, 13)}`);
    const allowed = await db.runTransaction(async (tx) => {
      const ref = db.doc(`emailRateLimits/${key}`);
      const snap = await tx.get(ref);
      const count = Number(snap.get("count") ?? 0);
      if (count >= 10) return false;
      tx.set(ref, { count: count + 1, expiresAt: new Date(Date.now() + 86400000) });
      return true;
    });
    if (allowed)
      await requestSubscription(
        input.data.email,
        input.data.measurement,
        input.data.source === "checkout" ? "checkout" : "storefront",
      );
    res.json({ ok: true });
  } catch {
    logger.error("subscribeNewsletter error");
    res.status(503).json({ error: "Please try again later" });
  }
});
export async function preferenceToken(contactId: string) {
  const token = randomBytes(32).toString("hex");
  await db
    .doc(`emailTokens/${hash(token)}`)
    .create({ contactId, purpose: "preferences", createdAt: new Date().toISOString() });
  return token;
}
export const newsletterConfirmationDetails = onRequest(async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const token = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .safeParse(req.body?.token);
  if (!token.success) {
    res.status(400).end();
    return;
  }
  const snap = await db.doc(`emailTokens/${hash(token.data)}`).get();
  if (
    snap.get("purpose") !== "confirm" ||
    snap.get("consumedAt") ||
    !snap.get("expiresAt") ||
    snap.get("expiresAt").toMillis() < Date.now()
  ) {
    res.status(400).end();
    return;
  }
  const contact = await db.doc(`emailContacts/${snap.get("contactId")}`).get();
  if (contact.get("generation") !== snap.get("generation") || contact.get("status") !== "pending") {
    res.status(400).end();
    return;
  }
  res.json({
    newsletterNotice: snap.get("newsletterNotice") ?? NEWSLETTER_NOTICE,
    measurementNotice: snap.get("measurementNotice") ?? MEASUREMENT_NOTICE,
    measurementRequested: contact.get("requestedMeasurement") === true,
  });
});
export const newsletterAction = onRequest({ cors: true }, async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const parsed = z
    .object({
      token: z.string().regex(/^[a-f0-9]{64}$/),
      action: z.enum(["confirm", "unsubscribe", "disableMeasurement"]),
      measurement: z.boolean().default(false),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid link" });
    return;
  }
  const { token, action } = parsed.data;
  const success = await db.runTransaction(async (tx) => {
    const tokenRef = db.doc(`emailTokens/${hash(token)}`);
    const tokenSnap = await tx.get(tokenRef);
    if (!tokenSnap.exists) return false;
    const tokenData = tokenSnap.data()!;
    if (tokenData.expiresAt && tokenData.expiresAt.toMillis() < Date.now()) return false;
    const ref = db.doc(`emailContacts/${tokenData.contactId}`);
    const contact = await tx.get(ref);
    if (!contact.exists) return false;
    if (action === "confirm") {
      if (
        !canConfirmNewsletter({
          purpose: tokenData.purpose,
          consumed: !!tokenData.consumedAt,
          expired: false,
          generation: tokenData.generation,
          currentGeneration: contact.get("generation"),
          status: contact.get("status"),
          suppressed: !!contact.get("suppression"),
        })
      )
        return false;
      tx.update(ref, {
        status: "confirmed",
        expiresAt: FieldValue.delete(),
        measurement: parsed.data.measurement,
        confirmedAt: new Date().toISOString(),
      });
      tx.update(tokenRef, { consumedAt: new Date().toISOString() });
      if (parsed.data.measurement)
        tx.create(db.collection("emailConsentEvents").doc(), {
          contactId: ref.id,
          action: "granted",
          purpose: "openMeasurement",
          notice: tokenData.measurementNotice ?? MEASUREMENT_NOTICE,
          version: tokenData.noticeVersion ?? NEWSLETTER_NOTICE_VERSION,
          at: new Date().toISOString(),
        });
    } else {
      if (tokenData.purpose !== "preferences") return false;
      if (action === "unsubscribe" && contact.get("measurement") === true)
        tx.create(db.collection("emailConsentEvents").doc(), {
          contactId: ref.id,
          action: "withdrawn",
          purpose: "openMeasurement",
          source: "preferences",
          at: new Date().toISOString(),
        });
      tx.update(ref, {
        ...(action === "unsubscribe" ? { status: "unsubscribed", generation: randomUUID() } : {}),
        measurement: false,
        updatedAt: new Date().toISOString(),
      });
    }
    tx.create(db.collection("emailConsentEvents").doc(), {
      contactId: ref.id,
      action: action === "confirm" ? "granted" : "withdrawn",
      purpose: action === "disableMeasurement" ? "openMeasurement" : "newsletter",
      ...(action === "confirm" ? { notice: tokenData.newsletterNotice ?? NEWSLETTER_NOTICE } : {}),
      version: tokenData.noticeVersion ?? NEWSLETTER_NOTICE_VERSION,
      at: new Date().toISOString(),
    });
    return true;
  });
  res
    .status(success ? 200 : 400)
    .json(success ? { ok: true } : { error: "This link is invalid or expired" });
});
export const newsletterOneClick = onRequest(async (req, res) => {
  res.set("Cache-Control", "no-store");
  const token = req.query.token;
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
    res.status(400).end();
    return;
  }
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(db.doc(`emailTokens/${hash(token)}`));
    if (snap.get("purpose") !== "preferences") return;
    const ref = db.doc(`emailContacts/${snap.get("contactId")}`);
    if (!(await tx.get(ref)).exists) return;
    tx.update(ref, {
      status: "unsubscribed",
      measurement: false,
      generation: randomUUID(),
      updatedAt: new Date().toISOString(),
    });
    tx.create(db.collection("emailConsentEvents").doc(), {
      contactId: ref.id,
      action: "withdrawn",
      purpose: "newsletter",
      source: "oneClick",
      at: new Date().toISOString(),
    });
  });
  res.status(200).end();
});
export const inviteEmailContact = onCall(async (req) => {
  requireAdmin(req);
  const input = z.object({ email: z.string().email() }).parse(req.data);
  await requestSubscription(input.email, false, "admin");
  return { ok: true };
});
export const importEmailContacts = onCall(async (req) => {
  requireAdmin(req);
  const input = z
    .object({
      dryRun: z.boolean().default(true),
      entries: z
        .array(
          z.object({
            email: z.string().email(),
            consentAt: z.string().datetime(),
            evidence: z.string().min(20).max(2000),
          }),
        )
        .min(1)
        .max(100),
    })
    .parse(req.data);
  let eligible = 0;
  let skipped = 0;
  for (const entry of input.entries) {
    if (new Date(entry.consentAt).getTime() > Date.now())
      throw new HttpsError("invalid-argument", "Consent evidence cannot be dated in the future");
    const email = normalizeEmail(entry.email);
    const imported = await db.runTransaction(async (tx) => {
      const index = db.doc(`emailContactIndex/${hash(email)}`);
      if ((await tx.get(index)).exists) return false;
      if (input.dryRun) return true;
      const id = randomUUID();
      tx.create(index, { contactId: id });
      tx.create(db.doc(`emailContacts/${id}`), {
        email,
        status: "confirmed",
        measurement: false,
        source: "consent_import",
        generation: randomUUID(),
        confirmedAt: entry.consentAt,
        createdAt: new Date().toISOString(),
      });
      tx.create(db.collection("emailConsentEvents").doc(), {
        contactId: id,
        action: "imported",
        purpose: "newsletter",
        evidence: entry.evidence,
        originalConsentAt: entry.consentAt,
        actor: req.auth!.uid,
        at: new Date().toISOString(),
      });
      return true;
    });
    if (imported) eligible++;
    else skipped++;
  }
  logger.info("importEmailContacts done", {
    dryRun: input.dryRun,
    eligible,
    skipped,
    actor: req.auth!.uid,
  });
  return { eligible, skipped, dryRun: input.dryRun };
});
export const unsubscribeEmailContact = onCall(async (req) => {
  requireAdmin(req);
  const id = z.string().uuid().parse(req.data?.contactId);
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`emailContacts/${id}`);
    if (!(await tx.get(ref)).exists) throw new HttpsError("not-found", "Contact not found");
    tx.update(ref, {
      status: "unsubscribed",
      measurement: false,
      generation: randomUUID(),
      updatedAt: new Date().toISOString(),
    });
    tx.create(db.collection("emailConsentEvents").doc(), {
      contactId: id,
      action: "withdrawn",
      purpose: "newsletter",
      actor: req.auth!.uid,
      at: new Date().toISOString(),
    });
  });
  return { ok: true };
});
