import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { z } from "zod";
import { emailSettingsSchema } from "@daedalus/shared";
import { db } from "../admin.js";
import { requireAdmin } from "../lib/auth.js";
import { trustedEmailImage } from "./validation.js";

export const listEmailRecords = onCall(async (req) => {
  requireAdmin(req);
  const input = z
    .object({
      kind: z.enum(["contacts", "campaigns", "deliveries", "consent"]),
      cursor: z.string().max(100).optional(),
      contactId: z.string().uuid().optional(),
      status: z.enum(["pending", "confirmed", "unsubscribed", "not_subscribed"]).optional(),
      email: z.string().email().optional(),
    })
    .parse(req.data);
  const collection = {
    contacts: "emailContacts",
    campaigns: "emailCampaigns",
    deliveries: "emailDeliveries",
    consent: "emailConsentEvents",
  }[input.kind];
  let query = db.collection(collection).orderBy("__name__").limit(50);
  if (input.kind === "consent" && input.contactId)
    query = query.where("contactId", "==", input.contactId);
  if (input.kind === "contacts" && input.status) query = query.where("status", "==", input.status);
  if (input.kind === "contacts" && input.email)
    query = query.where("email", "==", input.email.trim().toLowerCase());
  if (input.cursor) query = query.startAfter(input.cursor);
  const snap = await query.get();
  logger.info("listEmailRecords done", {
    kind: input.kind,
    count: snap.size,
    actor: req.auth!.uid,
  });
  return {
    records: snap.docs.map((doc) => {
      const data = doc.data();
      if (input.kind === "deliveries")
        return {
          id: doc.id,
          status: data.status,
          kind: data.kind,
          campaignId: data.campaignId ?? "",
          attempts: data.attempts,
          error: data.error ?? "",
          createdAt: data.createdAt,
        };
      return { id: doc.id, ...data };
    }),
    cursor: snap.size === 50 ? snap.docs.at(-1)!.id : null,
  };
});
export const emailAudienceSummary = onCall(async (req) => {
  requireAdmin(req);
  const count = await db
    .collection("emailContacts")
    .where("status", "==", "confirmed")
    .count()
    .get();
  return { confirmed: count.data().count };
});
export const emailCampaignStats = onCall(async (req) => {
  requireAdmin(req);
  const id = z.string().uuid().parse(req.data?.id);
  const base = db.collection("emailDeliveries").where("campaignId", "==", id);
  const statuses = [
    "queued",
    "submitting",
    "accepted",
    "deferred",
    "delivered",
    "failed",
    "suppressed",
    "ambiguous",
  ];
  const counts = await Promise.all(
    statuses.map(async (status) => [
      status,
      (await base.where("status", "==", status).count().get()).data().count,
    ]),
  );
  return Object.fromEntries(counts);
});
export const saveEmailSettings = onCall(async (req) => {
  requireAdmin(req);
  const settings = emailSettingsSchema.parse(req.data);
  if (settings.logoUrl && !trustedEmailImage(settings.logoUrl))
    throw new HttpsError("invalid-argument", "Use a public logo from this store's media storage");
  if (!settings.marketingPaused) {
    const [integration, health] = await db.getAll(
      db.doc("settings/integrations"),
      db.doc("emailHealth/provider"),
    );
    if (!integration.get("sendgrid.webhookPublicKey") || !health.get("webhookVerifiedAt"))
      throw new HttpsError(
        "failed-precondition",
        "Verify a signed SendGrid test event before enabling marketing",
      );
  }
  await db.doc("settings/email").set(settings);
  logger.info("saveEmailSettings done", {
    actor: req.auth!.uid,
    marketingPaused: settings.marketingPaused,
  });
  return { ok: true };
});
