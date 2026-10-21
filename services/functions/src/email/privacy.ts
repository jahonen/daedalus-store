import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { z } from "zod";
import { db } from "../admin.js";
import { requireAdmin } from "../lib/auth.js";

export const exportEmailContact = onCall(async (req) => {
  requireAdmin(req);
  const id = z.string().uuid().parse(req.data?.contactId);
  const contact = await db.doc(`emailContacts/${id}`).get();
  if (!contact.exists) throw new HttpsError("not-found", "Contact not found");
  const evidence = await db
    .collection("emailConsentEvents")
    .where("contactId", "==", id)
    .limit(500)
    .get();
  logger.info("exportEmailContact done", { contactId: id, actor: req.auth!.uid });
  return {
    contact: contact.data(),
    consentEvents: evidence.docs.map((doc) => doc.data()),
    evidenceLimit: 500,
  };
});
export const redactEmailContact = onCall({ timeoutSeconds: 300 }, async (req) => {
  requireAdmin(req);
  const input = z
    .object({
      contactId: z.string().uuid(),
      dryRun: z.boolean().default(true),
      confirmation: z.literal("REDACT NEWSLETTER DATA").optional(),
    })
    .parse(req.data);
  const ref = db.doc(`emailContacts/${input.contactId}`);
  const contact = await ref.get();
  if (!contact.exists) throw new HttpsError("not-found", "Contact not found");
  const deliveries = db.collection("emailDeliveries").where("contactId", "==", ref.id);
  const total = await deliveries.count().get();
  if (input.dryRun)
    return {
      dryRun: true,
      deliveryRecordsToReview: total.data().count,
      retained:
        "Order, accounting, Heritage, transactional-delivery and minimal consent/suppression records are not erased by this newsletter action.",
    };
  if (!input.confirmation)
    throw new HttpsError(
      "failed-precondition",
      "Explicit newsletter redaction confirmation required",
    );
  logger.info("redactEmailContact start", { contactId: ref.id, actor: req.auth!.uid });
  await db.runTransaction(async (tx) => {
    const latest = await tx.get(ref);
    tx.set(ref, {
      status: "erased",
      measurement: false,
      generation: randomUUID(),
      redactedAt: new Date().toISOString(),
      ...(latest.get("suppression") ? { suppression: latest.get("suppression") } : {}),
    });
    tx.create(db.collection("emailPrivacyEvents").doc(), {
      contactId: ref.id,
      actor: req.auth!.uid,
      action: "newsletter_redaction",
      at: new Date().toISOString(),
    });
  });
  for (const collection of ["emailTokens", "emailDeliveries", "emailConsentEvents"]) {
    let cursor = "";
    for (;;) {
      let query = db
        .collection(collection)
        .where("contactId", "==", ref.id)
        .orderBy("__name__")
        .limit(400);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      const batch = db.batch();
      for (const doc of page.docs) {
        if (collection === "emailTokens") batch.update(doc.ref, { purpose: "revoked" });
        else if (collection === "emailConsentEvents")
          batch.update(doc.ref, { evidence: FieldValue.delete() });
        else if (doc.get("kind") !== "transactional")
          batch.update(doc.ref, {
            to: FieldValue.delete(),
            html: FieldValue.delete(),
            text: FieldValue.delete(),
            headers: FieldValue.delete(),
            subject: FieldValue.delete(),
            status: "suppressed",
          });
      }
      await batch.commit();
      if (page.size < 400) break;
      cursor = page.docs.at(-1)!.id;
    }
  }
  logger.info("redactEmailContact done", { contactId: ref.id, actor: req.auth!.uid });
  return { dryRun: false, redacted: true };
});
