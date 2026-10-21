import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";
import {
  checkoutSessionSchema,
  companySettingsSchema,
  integrationsSettingsSchema,
} from "@daedalus/shared";
import type { CheckoutSession } from "@daedalus/shared";
import { db } from "../admin.js";
import { stripeSecretKey, stripeWebhookSecret } from "../config.js";
import { enqueueOrderEmail } from "../email/orderEmails.js";
import { formatEur, checkoutPaymentConfirmed } from "@daedalus/shared";

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

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const pendingRef = db.collection("checkoutSessions").doc(session.id);
      if (!checkoutPaymentConfirmed(session.payment_status)) {
        const waiting = await db.runTransaction(async (tx) => {
          const snap = await tx.get(pendingRef);
          if (snap.get("status") === "reserved")
            tx.update(pendingRef, { status: "awaiting_payment" });
          return ["reserved", "awaiting_payment"].includes(snap.get("status"));
        });
        const email = session.customer_details?.email ?? session.customer_email;
        if (waiting && email)
          await enqueueOrderEmail(
            `checkout:${session.id}:pending`,
            email,
            "Payment processing",
            `Your checkout ${session.id} is awaiting payment confirmation. We will send an order confirmation once your payment is confirmed.`,
          );
        res.status(200).send("awaiting payment");
        return;
      }
      const orderRef = db.collection("orders").doc();
      let purchased: CheckoutSession | null = null;

      // Pre-fetch lock refs outside the tx (immutable once created).
      const lockRefs = (
        await db.collection("inventoryLocks").where("stripeSessionId", "==", session.id).get()
      ).docs.map((d) => d.ref);

      await db.runTransaction(async (tx) => {
        const pendingSnap = await tx.get(pendingRef);
        if (!pendingSnap.exists) return; // already handled or unknown
        const pending = checkoutSessionSchema.parse(pendingSnap.data());
        if (pending.status !== "reserved" && pending.status !== "awaiting_payment") return; // already consumed/released

        for (const item of pending.items) {
          const ref = db.collection("products").doc(item.productId);
          tx.update(ref, {
            stockQuantity: FieldValue.increment(-item.qty),
            reservedQuantity: FieldValue.increment(-item.qty),
          });
        }
        for (const lockRef of lockRefs) tx.delete(lockRef);
        tx.update(pendingRef, { status: "consumed" });
        tx.set(orderRef, {
          stripeSessionId: session.id,
          ...(typeof session.payment_intent === "string"
            ? { stripePaymentIntentId: session.payment_intent }
            : {}),
          items: pending.items,
          amounts: pending.amounts,
          customer: {
            email: session.customer_details?.email ?? session.customer_email ?? "",
            ...(session.customer_details?.name ? { name: session.customer_details.name } : {}),
            ...(session.customer_details?.address
              ? {
                  address: {
                    line1: session.customer_details.address.line1 ?? "",
                    city: session.customer_details.address.city ?? "",
                    postalCode: session.customer_details.address.postal_code ?? "",
                    country: session.customer_details.address.country ?? "",
                  },
                }
              : {}),
          },
          status: "PENDING_FULFILLMENT",
          createdAt: new Date().toISOString(),
        });
        purchased = pending;
      });
      logger.info("order processed", { sessionId: session.id });
      if (purchased) {
        await reportPurchase(orderRef.id, purchased);
      }
    } else if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await releaseReservation(session.id, true);
      const pending = await db.doc(`checkoutSessions/${session.id}`).get();
      const email = session.customer_details?.email ?? session.customer_email;
      if (pending.get("status") === "released" && email)
        await enqueueOrderEmail(
          `checkout:${session.id}:failed`,
          email,
          "Payment could not be completed",
          `Payment for checkout ${session.id} could not be completed. Your reserved items have been released. You can return to the store to try another payment method.`,
        );
    } else if (event.type === "refund.created" || event.type === "refund.updated") {
      const refund = event.data.object as Stripe.Refund;
      if (refund.status === "succeeded" && typeof refund.payment_intent === "string") {
        const orders = await db
          .collection("orders")
          .where("stripePaymentIntentId", "==", refund.payment_intent)
          .limit(1)
          .get();
        let order = orders.docs[0];
        if (!order) {
          const sessions = await stripe.checkout.sessions.list({
            payment_intent: refund.payment_intent,
            limit: 1,
          });
          if (sessions.data[0]) {
            const legacyOrders = await db
              .collection("orders")
              .where("stripeSessionId", "==", sessions.data[0].id)
              .limit(1)
              .get();
            order = legacyOrders.docs[0];
          }
        }
        if (order) {
          const matchedOrder = order;
          await db.runTransaction(async (tx) => {
            const latest = await tx.get(matchedOrder.ref);
            const refundAmounts = {
              ...(latest.get("refundAmounts") ?? {}),
              [refund.id]: refund.amount,
            } as Record<string, number>;
            const refundedCents = Object.values(refundAmounts).reduce(
              (total, amount) => total + amount,
              0,
            );
            const totalCents = Number(latest.get("amounts.totalCents"));
            tx.update(matchedOrder.ref, {
              refundAmounts,
              refundedCents,
              stripePaymentIntentId: refund.payment_intent,
              ...(totalCents > 0 && refundedCents >= totalCents ? { status: "REFUNDED" } : {}),
            });
          });
        }
        if (order?.get("customer.email"))
          await enqueueOrderEmail(
            `refund:${refund.id}:succeeded`,
            order.get("customer.email"),
            "Refund confirmed",
            `A refund of ${formatEur(refund.amount)} has been confirmed for order ${order.get("stripeSessionId")}. Refund reference: ${refund.id}. Your bank may take additional time to display it.`,
          );
      }
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await releaseReservation(session.id);
      logger.info("reservation released (expired)", { sessionId: session.id });
    }

    res.status(200).send("ok");
  },
);

/**
 * GA4 Measurement Protocol purchase hit — fires server-side on confirmed
 * payment, so ad-blocked buyers still record revenue. The browser's _ga
 * client_id (captured at checkout when consented) joins the hit to the
 * same session; without it we use the Stripe session id as the client.
 * Non-fatal: analytics never blocks order processing.
 */
async function reportPurchase(orderId: string, pending: CheckoutSession) {
  if (!pending.gaClientId) return;
  try {
    const [companySnap, integSnap] = await Promise.all([
      db.collection("settings").doc("company").get(),
      db.collection("settings").doc("integrations").get(),
    ]);
    const measurementId = companySnap.exists
      ? companySettingsSchema.parse(companySnap.data()).gaMeasurementId
      : "";
    const apiSecret = integSnap.exists
      ? integrationsSettingsSchema.parse(integSnap.data()).gaApiSecret
      : "";
    if (!measurementId || !apiSecret) return;

    const res = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: pending.gaClientId,
          events: [
            {
              name: "purchase",
              params: {
                transaction_id: orderId,
                value: pending.amounts.totalCents / 100,
                currency: pending.amounts.currency,
                items: pending.items.map((i) => ({
                  item_id: i.productId,
                  item_name: i.name,
                  price: i.unitPriceCents / 100,
                  quantity: i.qty,
                })),
              },
            },
          ],
        }),
      },
    );
    if (!res.ok) {
      logger.warn("GA purchase hit rejected", { status: res.status, orderId });
    } else {
      logger.info("GA purchase reported", { orderId });
    }
  } catch (e) {
    logger.warn("GA purchase report failed", { error: String(e), orderId });
  }
}

/**
 * Shared release path: drop locks, decrement reservedQuantity.
 * Status check is INSIDE the transaction to prevent double-release races
 * between concurrent webhook/expireLocks invocations.
 */
export async function releaseReservation(sessionId: string, paymentFailed = false) {
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
    if (
      pending.status === "consumed" ||
      pending.status === "released" ||
      (pending.status === "awaiting_payment" && !paymentFailed)
    )
      return;

    for (const item of pending.items) {
      tx.update(db.collection("products").doc(item.productId), {
        reservedQuantity: FieldValue.increment(-item.qty),
      });
    }
    for (const lockRef of lockRefs) tx.delete(lockRef);
    tx.update(pendingRef, { status: "released" });
  });
}
