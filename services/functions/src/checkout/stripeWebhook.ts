import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";
import { checkoutSessionSchema } from "@daedalus/shared";
import { db } from "../admin.js";
import { stripeSecretKey, stripeWebhookSecret } from "../config.js";

/**
 * Stripe webhook (spec §4.1):
 *  - checkout.session.completed → decrement stock + reservations, create order
 *  - checkout.session.expired   → release reservations back to stock
 *
 * Critical safety: all status checks happen INSIDE transactions to prevent
 * duplicate orders / double stock decrements from concurrent webhook deliveries
 * or expireLocks races.
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

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const pendingRef = db.collection("checkoutSessions").doc(session.id);

      // Pre-fetch lock refs outside the tx (immutable once created).
      const lockRefs = (
        await db
          .collection("inventoryLocks")
          .where("stripeSessionId", "==", session.id)
          .get()
      ).docs.map((d) => d.ref);

      await db.runTransaction(async (tx) => {
        const pendingSnap = await tx.get(pendingRef);
        if (!pendingSnap.exists) return; // already handled or unknown
        const pending = checkoutSessionSchema.parse(pendingSnap.data());
        if (pending.status !== "reserved") return; // already consumed/released

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
      logger.info("order processed", { sessionId: session.id });
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await releaseReservation(session.id);
      logger.info("reservation released (expired)", { sessionId: session.id });
    }

    res.status(200).send("ok");
  },
);

/**
 * Shared release path: drop locks, decrement reservedQuantity.
 * Status check is INSIDE the transaction to prevent double-release races
 * between concurrent webhook/expireLocks invocations.
 */
export async function releaseReservation(sessionId: string) {
  const pendingRef = db.collection("checkoutSessions").doc(sessionId);

  // Pre-fetch lock refs outside the tx (immutable once created).
  const lockRefs = (
    await db.collection("inventoryLocks").where("stripeSessionId", "==", sessionId).get()
  ).docs.map((d) => d.ref);

  await db.runTransaction(async (tx) => {
    const pendingSnap = await tx.get(pendingRef);
    if (!pendingSnap.exists) return;
    const pending = checkoutSessionSchema.parse(pendingSnap.data());
    // Only release sessions in "reserved" or "reserving" (orphaned pre-Stripe).
    if (pending.status === "consumed" || pending.status === "released") return;

    for (const item of pending.items) {
      tx.update(db.collection("products").doc(item.productId), {
        reservedQuantity: FieldValue.increment(-item.qty),
      });
    }
    for (const lockRef of lockRefs) tx.delete(lockRef);
    tx.update(pendingRef, { status: "released" });
  });
}
