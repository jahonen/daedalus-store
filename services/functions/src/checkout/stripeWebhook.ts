import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";
import { orderSchema, orderItemSchema } from "@daedalus/shared";
import { z } from "zod";
import { db } from "../admin.js";
import { stripeSecretKey, stripeWebhookSecret } from "../config.js";

const pendingSessionSchema = z.object({
  items: z.array(orderItemSchema),
  amounts: orderSchema.shape.amounts,
  status: z.string(),
});

/**
 * Stripe webhook (spec §4.1):
 *  - checkout.session.completed → decrement stock + reservations, create order
 *  - checkout.session.expired   → release reservations back to stock
 */
export const stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (req, res) => {
    logger.info("stripeWebhook start");
    const stripe = new Stripe(stripeSecretKey.value());

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        req.headers["stripe-signature"] as string,
        stripeWebhookSecret.value(),
      );
    } catch (e) {
      logger.warn("invalid webhook signature", { error: String(e) });
      res.status(400).send("invalid signature");
      return;
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const pendingRef = db.collection("checkoutSessions").doc(session.id);

    if (event.type === "checkout.session.completed") {
      const pendingSnap = await pendingRef.get();
      if (!pendingSnap.exists) {
        logger.warn("no pending session found", { sessionId: session.id });
        res.status(200).send("ok"); // idempotent ack
        return;
      }
      const pending = pendingSessionSchema.parse(pendingSnap.data());
      if (pending.status !== "consumed") {
        const lockRefs = (
          await db
            .collection("inventoryLocks")
            .where("stripeSessionId", "==", session.id)
            .get()
        ).docs.map((d) => d.ref);
        await db.runTransaction(async (tx) => {
          for (const item of pending.items) {
            const ref = db.collection("products").doc(item.productId);
            tx.update(ref, {
              stockQuantity: FieldValue.increment(-item.qty),
              reservedQuantity: FieldValue.increment(-item.qty),
            });
          }
          for (const lockRef of lockRefs) tx.delete(lockRef);
          tx.update(pendingRef, { status: "consumed" });
          tx.set(db.collection("orders").doc(), {
            stripeSessionId: session.id,
            items: pending.items,
            amounts: pending.amounts,
            customer: {
              email: session.customer_details?.email ?? session.customer_email ?? "",
              name: session.customer_details?.name ?? undefined,
              address: session.customer_details?.address
                ? {
                    line1: session.customer_details.address.line1 ?? "",
                    city: session.customer_details.address.city ?? "",
                    postalCode: session.customer_details.address.postal_code ?? "",
                    country: session.customer_details.address.country ?? "",
                  }
                : undefined,
            },
            status: "PENDING_FULFILLMENT",
            createdAt: new Date().toISOString(),
          });
        });
        logger.info("order created", { sessionId: session.id });
      }
    } else if (event.type === "checkout.session.expired") {
      await releaseReservation(session.id, pendingRef);
      logger.info("reservation released (expired)", { sessionId: session.id });
    }

    res.status(200).send("ok");
  },
);

/** Shared release path: drop locks, decrement reservedQuantity. */
export async function releaseReservation(
  sessionId: string,
  pendingRef = db.collection("checkoutSessions").doc(sessionId),
) {
  const pendingSnap = await pendingRef.get();
  if (!pendingSnap.exists) return;
  const pending = pendingSessionSchema.parse(pendingSnap.data());
  if (pending.status === "consumed" || pending.status === "released") return;

  const lockRefs = (
    await db.collection("inventoryLocks").where("stripeSessionId", "==", sessionId).get()
  ).docs.map((d) => d.ref);

  await db.runTransaction(async (tx) => {
    for (const item of pending.items) {
      tx.update(db.collection("products").doc(item.productId), {
        reservedQuantity: FieldValue.increment(-item.qty),
      });
    }
    for (const lockRef of lockRefs) tx.delete(lockRef);
    tx.update(pendingRef, { status: "released" });
  });
}
