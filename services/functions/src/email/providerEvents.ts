import { verifyEmailWebhook } from "./providerSignature.js";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { z } from "zod";
import { db } from "../admin.js";
import { deliveryKey } from "./outbox.js";

const eventSchema = z.object({
  sg_event_id: z.string().min(1).max(1000),
  event: z.string().max(100),
  type: z.string().max(100).optional(),
  deliveryId: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  timestamp: z.number(),
});
export const sendgridEvents = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const settings = await db.doc("settings/integrations").get();
  const publicKey = settings.get("sendgrid.webhookPublicKey");
  const timestamp = req.get("X-Twilio-Email-Event-Webhook-Timestamp") ?? "";
  const signature = req.get("X-Twilio-Email-Event-Webhook-Signature") ?? "";
  const verified =
    typeof publicKey === "string" &&
    verifyEmailWebhook(publicKey, timestamp, signature, req.rawBody);
  if (!verified) {
    logger.warn("sendgridEvents rejected", {
      publicKeyConfigured: typeof publicKey === "string",
      signaturePresent: signature.length > 0,
      timestampPresent: /^\d+$/.test(timestamp),
      timestampAgeSeconds: /^\d+$/.test(timestamp)
        ? Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp))
        : null,
      bodyBytes: req.rawBody?.length ?? null,
    });
    res.status(403).end();
    return;
  }
  const parsed = z.array(eventSchema).max(1000).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).end();
    return;
  }
  await db
    .doc("emailHealth/provider")
    .set({ webhookVerifiedAt: new Date().toISOString() }, { merge: true });
  logger.info("sendgridEvents start", { count: parsed.data.length });
  for (const event of parsed.data) {
    if (!event.deliveryId) continue;
    await db.runTransaction(async (tx) => {
      const eventRef = db.doc(`emailProviderEvents/${deliveryKey(event.sg_event_id)}`);
      if ((await tx.get(eventRef)).exists) return;
      const ref = db.doc(`emailDeliveries/${event.deliveryId}`);
      const delivery = await tx.get(ref);
      if (!delivery.exists) return;
      const contact = delivery.get("contactId")
        ? await tx.get(db.doc(`emailContacts/${delivery.get("contactId")}`))
        : null;
      const campaign = delivery.get("campaignId")
        ? await tx.get(db.doc(`emailCampaigns/${delivery.get("campaignId")}`))
        : null;
      if (
        event.event === "open" &&
        (contact?.get("measurement") !== true ||
          delivery.get("trackingEligible") !== true ||
          delivery.get("kind") !== "marketing" ||
          Date.now() - new Date(delivery.get("createdAt")).getTime() >= 30 * 86400000)
      )
        return;
      const openRef = db.doc(`emailOpenDedup/${ref.id}`);
      const open = event.event === "open" ? await tx.get(openRef) : null;
      tx.create(eventRef, {
        event: event.event,
        deliveryId: ref.id,
        at: event.timestamp,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      });
      if (["bounce", "dropped", "spamreport"].includes(event.event)) {
        tx.update(ref, { status: "failed", providerEvent: event.event });
        if (
          contact?.exists &&
          (event.event === "spamreport" || (event.event === "bounce" && event.type !== "blocked"))
        )
          tx.update(contact.ref, { suppression: event.event, measurement: false });
      } else if (
        ["deferred", "processed"].includes(event.event) &&
        !["delivered", "failed", "suppressed"].includes(delivery.get("status"))
      ) {
        tx.update(ref, { status: event.event === "deferred" ? "deferred" : "accepted" });
      } else if (
        event.event === "delivered" &&
        !["failed", "suppressed"].includes(delivery.get("status"))
      ) {
        tx.update(ref, {
          status: "delivered",
          deliveredAt: new Date(event.timestamp * 1000).toISOString(),
        });
      } else if (["unsubscribe", "group_unsubscribe"].includes(event.event) && contact?.exists) {
        tx.update(contact.ref, { status: "unsubscribed", measurement: false });
        tx.create(db.collection("emailConsentEvents").doc(), {
          contactId: contact.id,
          action: "withdrawn",
          purpose: "newsletter",
          source: "provider",
          at: new Date().toISOString(),
        });
      } else if (
        event.event === "open" &&
        contact?.get("measurement") === true &&
        delivery.get("kind") === "marketing" &&
        delivery.get("trackingEligible") === true &&
        campaign?.exists &&
        !open?.exists &&
        Date.now() - new Date(delivery.get("createdAt")).getTime() < 30 * 86400000
      ) {
        tx.create(openRef, { expiresAt: new Date(Date.now() + 30 * 86400000) });
        tx.update(campaign.ref, {
          approximateOpens: Number(campaign.get("approximateOpens") ?? 0) + 1,
        });
      }
    });
  }
  logger.info("sendgridEvents done");
  res.json({ ok: true });
});
