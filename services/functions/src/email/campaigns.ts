import { randomUUID } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { z } from "zod";
import { emailContentSchema, renderEmail } from "@daedalus/shared";
import { db } from "../admin.js";
import { requireAdmin } from "../lib/auth.js";
import { emailContext, preferenceToken } from "./contacts.js";
import { enqueueEmail } from "./outbox.js";
import { validateCampaignContent } from "./validation.js";

export const saveEmailCampaign = onCall(async (req) => {
  requireAdmin(req);
  const input = z
    .object({
      id: z.string().uuid().optional(),
      revision: z.number().int().default(0),
      content: emailContentSchema,
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(6000) })).max(20).default([]),
    })
    .parse(req.data);
  const ref = db.doc(`emailCampaigns/${input.id ?? randomUUID()}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && (snap.get("status") !== "draft" || snap.get("revision") !== input.revision))
      throw new HttpsError("failed-precondition", "Campaign changed; reload it before editing");
    tx.set(ref, {
      content: input.content,
      history: input.history,
      revision: input.revision + 1,
      status: "draft",
      updatedAt: new Date().toISOString(),
      actor: req.auth!.uid,
    });
  });
  return { id: ref.id, revision: input.revision + 1 };
});
export const testEmailCampaign = onCall(async (req) => {
  requireAdmin(req);
  const input = z.object({ content: emailContentSchema, to: z.string().email() }).parse(req.data);
  const ctx = await emailContext();
  if (!ctx.settings.testRecipients.includes(input.to))
    throw new HttpsError(
      "failed-precondition",
      "Add this address to approved email test recipients first",
    );
  await validateCampaignContent(input.content, ctx.base, ctx.settings.logoUrl);
  const content = { ...input.content, subject: `[TEST] ${input.content.subject}` };
  const rendered = renderEmail({ ...ctx, content });
  await enqueueEmail(`test:${randomUUID()}`, {
    to: input.to,
    subject: content.subject,
    ...rendered,
    kind: "test",
  });
  return { ok: true };
});
export const scheduleEmailCampaign = onCall(async (req) => {
  requireAdmin(req);
  const input = z
    .object({
      id: z.string().uuid(),
      revision: z.number().int(),
      scheduledAt: z.string().datetime(),
      timeZone: z.string().max(100).default("UTC"),
    })
    .parse(req.data);
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timeZone }).format();
  } catch {
    throw new HttpsError("invalid-argument", "Choose a valid time zone");
  }
  const when = new Date(input.scheduledAt).getTime();
  if (when < Date.now() - 60000) throw new HttpsError("invalid-argument", "Choose a future time");
  const ctx = await emailContext();
  if (ctx.settings.marketingPaused)
    throw new HttpsError("failed-precondition", "Marketing is paused; finish email setup first");
  const ref = db.doc(`emailCampaigns/${input.id}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.get("status") !== "draft" || snap.get("revision") !== input.revision)
      throw new HttpsError("failed-precondition", "Draft revision changed");
    const content = emailContentSchema.parse(snap.get("content"));
    renderEmail({ ...ctx, content });
    const productIds = await validateCampaignContent(content, ctx.base, ctx.settings.logoUrl);
    tx.create(ref.collection("revisions").doc(String(input.revision)), {
      content,
      productIds,
      company: ctx.company,
      settings: ctx.settings,
      base: ctx.base,
      approvedBy: req.auth!.uid,
    });
    tx.update(ref, {
      status: "scheduled",
      scheduledAt: input.scheduledAt,
      timeZone: input.timeZone,
      cursor: "",
      recipientCount: 0,
      approximateOpens: 0,
    });
  });
  return { ok: true };
});
export const retryRejectedEmailCampaign = onCall(async (req) => {
  requireAdmin(req);
  const id = z.string().uuid().parse(req.data?.id);
  const campaignRef = db.doc(`emailCampaigns/${id}`);
  const current = await campaignRef.get();
  if (!["submitted_with_errors", "sending", "queued"].includes(current.get("status")))
    throw new HttpsError(
      "failed-precondition",
      "Only an active or failed submission can be retried",
    );
  const failed = await db
    .collection("emailDeliveries")
    .where("campaignId", "==", id)
    .where("status", "==", "failed")
    .limit(100)
    .get();
  let retried = 0;
  for (const doc of failed.docs) {
    const reset = await db.runTransaction(async (tx) => {
      const [delivery, campaign] = await Promise.all([tx.get(doc.ref), tx.get(campaignRef)]);
      if (
        campaign.get("status") === "cancelled" ||
        delivery.get("status") !== "failed" ||
        delivery.get("acceptedAt") ||
        delivery.get("providerEvent")
      )
        return false;
      tx.update(doc.ref, { status: "queued", attempts: 0, nextAttemptAt: 0 });
      tx.update(campaignRef, { status: "sending" });
      return true;
    });
    if (reset) retried++;
  }
  logger.info("retryRejectedEmailCampaign done", { campaignId: id, retried, actor: req.auth!.uid });
  return { retried };
});
export const cancelEmailCampaign = onCall(async (req) => {
  requireAdmin(req);
  const id = z.string().uuid().parse(req.data?.id);
  await db.doc(`emailCampaigns/${id}`).update({ status: "cancelled" });
  return { ok: true };
});
export const prepareEmailCampaigns = onSchedule(
  { schedule: "every 5 minutes", region: "europe-west3" },
  async () => {
    const snap = await db
      .collection("emailCampaigns")
      .where("status", "in", ["scheduled", "preparing"])
      .limit(20)
      .get();
    for (const candidate of snap.docs) {
      if (new Date(candidate.get("scheduledAt")).getTime() > Date.now()) continue;
      const owner = randomUUID();
      const claimed = await db.runTransaction(async (tx) => {
        const current = await tx.get(candidate.ref);
        if (
          !["scheduled", "preparing"].includes(current.get("status")) ||
          (current.get("leaseUntil") ?? 0) > Date.now()
        )
          return null;
        const audienceCutoff = current.get("audienceCutoff") ?? new Date().toISOString();
        tx.update(candidate.ref, {
          status: "preparing",
          owner,
          leaseUntil: Date.now() + 300000,
          audienceCutoff,
        });
        return {
          revision: Number(current.get("revision")),
          cursor: String(current.get("cursor") ?? ""),
          audienceCutoff: String(audienceCutoff),
        };
      });
      if (!claimed) continue;
      logger.info("prepareEmailCampaign start", { campaignId: candidate.id });
      const revision = await candidate.ref
        .collection("revisions")
        .doc(String(claimed.revision))
        .get();
      const data = revision.data()!;
      let query = db.collection("emailContacts").orderBy("__name__").limit(100);
      if (claimed.cursor) query = query.startAfter(claimed.cursor);
      const contacts = await query.get();
      let count = 0;
      for (const contact of contacts.docs) {
        if (contact.get("status") !== "confirmed" || contact.get("suppression")) continue;
        if (
          new Date(contact.get("confirmedAt")).getTime() >
            new Date(claimed.audienceCutoff).getTime() ||
          new Date(contact.get("createdAt")).getTime() > new Date(claimed.audienceCutoff).getTime()
        )
          continue;
        const token = await preferenceToken(contact.id);
        const unsubscribeUrl = `${data.base}/newsletter?token=${token}&action=unsubscribe`;
        const preferencesUrl = `${data.base}/newsletter?token=${token}&action=preferences`;
        const oneClickUrl = `https://europe-north1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/newsletterOneClick?token=${token}`;
        const rendered = renderEmail({
          content: data.content,
          company: data.company,
          settings: data.settings,
          unsubscribeUrl,
          preferencesUrl,
        });
        await enqueueEmail(`campaign:${candidate.id}:${claimed.revision}:${contact.id}`, {
          ...rendered,
          subject: data.content.subject,
          to: contact.get("email"),
          contactId: contact.id,
          campaignId: candidate.id,
          kind: "marketing",
          productIds: data.productIds ?? [],
          senderName:
            data.settings.senderName || data.company.storefrontName || data.company.legalName,
          replyTo: data.settings.replyTo || data.company.contactEmail,
          headers: {
            "List-Unsubscribe": `<${oneClickUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        count++;
      }
      await db.runTransaction(async (tx) => {
        const current = await tx.get(candidate.ref);
        if (current.get("owner") !== owner || current.get("status") === "cancelled") return;
        tx.update(candidate.ref, {
          status: contacts.size < 100 ? "queued" : "preparing",
          cursor: contacts.docs.at(-1)?.id ?? claimed.cursor,
          leaseUntil: 0,
          recipientCount: Number(current.get("recipientCount") ?? 0) + count,
        });
      });
      logger.info("prepareEmailCampaign done", { campaignId: candidate.id, count });
    }
    const running = await db
      .collection("emailCampaigns")
      .where("status", "in", ["queued", "sending"])
      .limit(20)
      .get();
    for (const campaign of running.docs) {
      const deliveries = db.collection("emailDeliveries").where("campaignId", "==", campaign.id);
      const [pending, failed, total] = await Promise.all([
        deliveries.where("status", "in", ["queued", "submitting"]).count().get(),
        deliveries.where("status", "in", ["failed", "ambiguous"]).count().get(),
        deliveries.count().get(),
      ]);
      await db.runTransaction(async (tx) => {
        const latest = await tx.get(campaign.ref);
        if (!["queued", "sending"].includes(latest.get("status"))) return;
        tx.update(campaign.ref, {
          status: pending.data().count
            ? "sending"
            : failed.data().count
              ? "submitted_with_errors"
              : "submitted",
          recipientCount: total.data().count,
        });
      });
    }
  },
);
