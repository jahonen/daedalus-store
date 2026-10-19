import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { orderSchema } from "@daedalus/shared";
import { sendEmail, trackingUrl, withdrawalSection } from "./sendgrid.js";
import { sendgridApiKey, storeBaseUrl } from "../config.js";
import { formatEur } from "@daedalus/shared";

/** Order confirmation incl. EU 14-day withdrawal documentation. */
export const onOrderCreate = onDocumentCreated(
  { document: "orders/{orderId}", secrets: [sendgridApiKey], retry: true },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const order = orderSchema.parse(snap.data());
    if (!order.customer.email) return;
    logger.info("onOrderCreate start", { orderId: snap.id });

    const lines = order.items
      .map((i) => `${i.qty} × ${i.name} — ${formatEur(i.unitPriceCents * i.qty)}`)
      .join("\n");
    const storeBase = storeBaseUrl.value();
    const text = [
      `Thank you for your order!`,
      "",
      "Order summary:",
      lines,
      "",
      `Total: ${formatEur(order.amounts.totalCents)} (incl. VAT ${formatEur(order.amounts.vatCents)})`,
      `Order reference: ${order.stripeSessionId}`,
      "We'll email tracking details as soon as your order ships.",
      withdrawalSection(storeBase),
    ].join("\n");

    await sendEmail({
      to: order.customer.email,
      subject: "Order confirmation",
      text,
    });
    logger.info("onOrderCreate done", { orderId: snap.id });
  },
);

/** Shipping dispatch email with localized tracking link + withdrawal terms. */
export const onOrderFulfilled = onDocumentUpdated(
  { document: "orders/{orderId}", secrets: [sendgridApiKey], retry: true },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    const prev = orderSchema.parse(before);
    const next = orderSchema.parse(after);
    if (prev.status === next.status || next.status !== "FULFILLED") return;
    if (!next.customer.email) return;
    logger.info("onOrderFulfilled start", { orderId: event.data!.after.id });

    const track =
      next.carrier && next.trackingNumber
        ? trackingUrl(next.carrier, next.trackingNumber)
        : "";
    const text = [
      `Your order has shipped!`,
      "",
      next.carrier ? `Carrier: ${next.carrier}` : "",
      next.trackingNumber ? `Tracking number: ${next.trackingNumber}` : "",
      track ? `Track your parcel: ${track}` : "",
      withdrawalSection(storeBaseUrl.value()),
    ]
      .filter(Boolean)
      .join("\n");

    await sendEmail({ to: next.customer.email, subject: "Your order has shipped", text });
    logger.info("onOrderFulfilled done", { orderId: event.data!.after.id });
  },
);
