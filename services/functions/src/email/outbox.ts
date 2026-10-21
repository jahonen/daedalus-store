import { createHash, randomUUID } from "node:crypto";
import { getFunctions } from "firebase-admin/functions";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import {
  classifyEmailFailure,
  marketingEligibility,
  emailSettingsSchema,
  normalizeEmail,
} from "@daedalus/shared";
import { db } from "../admin.js";
import { sendgridApiKey } from "../config.js";
import { sendEmail } from "./sendgrid.js";

export const deliveryKey = (value: string) => createHash("sha256").update(value).digest("hex");
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  kind: "transactional" | "confirmation" | "marketing" | "test";
  contactId?: string;
  campaignId?: string;
  productIds?: string[];
  headers?: Record<string, string>;
  senderName?: string;
  replyTo?: string;
  trackOpens?: boolean;
}
export async function enqueueEmail(key: string, message: OutgoingEmail) {
  const ref = db.collection("emailDeliveries").doc(deliveryKey(key));
  await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return;
    const email = normalizeEmail(message.to);
    const indexRef = db.doc(`emailContactIndex/${deliveryKey(email)}`);
    const index = await tx.get(indexRef);
    const contactId = index.get("contactId") ?? message.contactId ?? randomUUID();
    if (!index.exists) {
      tx.create(indexRef, { contactId });
      if (!message.contactId)
        tx.create(db.doc(`emailContacts/${contactId}`), {
          email,
          status: "not_subscribed",
          measurement: false,
          source: "service",
          createdAt: new Date().toISOString(),
        });
    }
    const clean = Object.fromEntries(
      Object.entries(message).filter(([, value]) => value !== undefined),
    );
    tx.create(ref, {
      ...clean,
      to: email,
      contactId,
      status: "queued",
      attempts: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 90 * 86400000),
    });
  });
  return ref.id;
}
const queue = (kind: string) =>
  getFunctions().taskQueue(
    `locations/europe-west3/functions/${kind === "marketing" ? "deliverMarketingEmail" : "deliverTransactionalEmail"}`,
  );
export const onEmailQueued = onDocumentCreated("emailDeliveries/{deliveryId}", async (event) => {
  await queue(event.data?.get("kind") ?? "transactional").enqueue({
    deliveryId: event.params.deliveryId,
  });
});
export const recoverEmailQueue = onSchedule(
  { schedule: "every 5 minutes", region: "europe-west3" },
  async () => {
    for (const kinds of [["transactional", "confirmation", "test"], ["marketing"]]) {
      const queued = await db
        .collection("emailDeliveries")
        .where("status", "==", "queued")
        .where("kind", "in", kinds)
        .limit(100)
        .get();
      await Promise.all(
        queued.docs
          .filter((doc) => (doc.get("nextAttemptAt") ?? 0) <= Date.now())
          .map((doc) => queue(doc.get("kind")).enqueue({ deliveryId: doc.id })),
      );
    }
    const stale = await db
      .collection("emailDeliveries")
      .where("status", "==", "submitting")
      .limit(100)
      .get();
    for (const doc of stale.docs) {
      await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(doc.ref);
        if (snapshot.get("status") === "submitting" && snapshot.get("leaseUntil") < Date.now())
          tx.update(doc.ref, {
            status: "ambiguous",
            error: "Provider acceptance uncertain; review before retry",
          });
      });
    }
  },
);
async function deliverMessage(input: { deliveryId?: unknown }, marketing: boolean) {
  const id = input?.deliveryId;
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) return;
  const ref = db.collection("emailDeliveries").doc(id);
  const owner = randomUUID();
  logger.info("deliverEmail start", { deliveryId: id });
  const message = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.get("status") !== "queued" || (snap.get("nextAttemptAt") ?? 0) > Date.now())
      return null;
    const data = snap.data() as OutgoingEmail & { attempts: number };
    if ((data.kind === "marketing") !== marketing) return null;
    const settingsSnap = await tx.get(db.doc("settings/email"));
    const settings = emailSettingsSchema.parse(settingsSnap.data() ?? {});
    const contact = data.contactId ? await tx.get(db.doc(`emailContacts/${data.contactId}`)) : null;
    const campaign = data.campaignId
      ? await tx.get(db.doc(`emailCampaigns/${data.campaignId}`))
      : null;
    const products = await Promise.all(
      (data.productIds ?? []).map((productId) => tx.get(db.doc(`products/${productId}`))),
    );
    if (products.some((product) => product.get("status") !== "active")) {
      tx.update(ref, {
        status: "failed",
        error: "Linked product is no longer active; revise this campaign",
      });
      return null;
    }
    const eligibility = marketingEligibility({
      paused: settings.marketingPaused,
      status: contact?.get("status"),
      suppressed: !!contact?.get("suppression"),
      cancelled: campaign?.get("status") === "cancelled",
    });
    if (
      contact?.get("suppression") ||
      (data.kind === "marketing" && eligibility === "suppressed")
    ) {
      tx.update(ref, { status: "suppressed" });
      return null;
    }
    if (data.kind === "marketing" && eligibility === "paused") return null;
    if (data.attempts >= 5) {
      tx.update(ref, { status: "failed", error: "Retry limit reached" });
      return null;
    }
    const trackOpens =
      data.kind === "marketing" &&
      settings.openTrackingEnabled &&
      contact?.get("measurement") === true;
    tx.update(ref, {
      status: "submitting",
      owner,
      attempts: data.attempts + 1,
      leaseUntil: Date.now() + 120000,
      trackingEligible: trackOpens,
    });
    return { ...data, trackOpens };
  });
  if (!message) return;
  try {
    const messageId = await sendEmail({ ...message, deliveryId: id });
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.get("owner") !== owner) return;
      tx.update(ref, {
        status: ["delivered", "deferred", "failed", "suppressed"].includes(snap.get("status"))
          ? snap.get("status")
          : "accepted",
        messageId,
        acceptedAt: new Date().toISOString(),
      });
    });
    logger.info("deliverEmail done", { deliveryId: id });
  } catch (error) {
    const code = Number((error as { code?: number }).code);
    const status = classifyEmailFailure(code);
    const transient = status === "queued";
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (
        current.get("owner") !== owner ||
        ["accepted", "delivered", "deferred", "failed", "suppressed"].includes(
          current.get("status"),
        )
      )
        return;
      tx.update(ref, {
        status,
        nextAttemptAt: transient
          ? Date.now() +
            Math.min(3600000, 60000 * 2 ** message.attempts) +
            Math.floor(Math.random() * 10000)
          : 0,
        error: Number.isFinite(code) ? `Provider status ${code}` : "Provider acceptance uncertain",
      });
    });
    logger.error("deliverEmail error", { deliveryId: id, status });
    if (transient) throw new Error("Transient mail provider failure");
  }
}
const deliveryOptions = {
  region: "europe-west3",
  secrets: [sendgridApiKey],
  retryConfig: { maxAttempts: 5, minBackoffSeconds: 60, maxBackoffSeconds: 3600 },
  rateLimits: { maxConcurrentDispatches: 2, maxDispatchesPerSecond: 2 },
  timeoutSeconds: 90,
};
export const deliverMarketingEmail = onTaskDispatched(deliveryOptions, (req) =>
  deliverMessage(req.data, true),
);
export const deliverTransactionalEmail = onTaskDispatched(deliveryOptions, (req) =>
  deliverMessage(req.data, false),
);
