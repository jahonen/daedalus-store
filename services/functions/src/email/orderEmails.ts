import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { orderSchema } from "@daedalus/shared";
import { trackingUrl, withdrawalSection } from "./sendgrid.js";
import { renderEmail } from "@daedalus/shared";
import { emailContext } from "./contacts.js";
import { enqueueEmail } from "./outbox.js";
import { sendgridApiKey, storeBaseUrl } from "../config.js";
import { formatEur } from "@daedalus/shared";

export async function enqueueOrderEmail(key: string, to: string, subject: string, text: string) {
  const ctx = await emailContext();
  const rendered = renderEmail({
    ...ctx,
    content: { subject, preheader: "", blocks: [{ type: "paragraph", text }] },
  });
  await enqueueEmail(key, {
    to,
    subject,
    ...rendered,
    kind: "transactional",
    senderName: ctx.settings.senderName || ctx.company.storefrontName || ctx.company.legalName,
    replyTo: ctx.settings.replyTo || ctx.company.contactEmail,
  });
}

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

    await enqueueOrderEmail(
      `order:${snap.id}:paid`,
      order.customer.email,
      "Order confirmation",
      text,
    );
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
    if (prev.status === next.status) return;
    if (next.status === "CANCELLED" && next.customer.email) {
      await enqueueOrderEmail(
        `order:${event.params.orderId}:cancelled`,
        next.customer.email,
        "Order cancelled",
        `Your order ${next.stripeSessionId} has been cancelled. If a refund is due, we will notify you separately when the payment provider confirms it.`,
      );
      return;
    }
    if (next.status !== "FULFILLED") return;
    if (!next.customer.email) return;
    logger.info("onOrderFulfilled start", { orderId: event.data!.after.id });

    const track =
      next.carrier && next.trackingNumber ? trackingUrl(next.carrier, next.trackingNumber) : "";
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

    await enqueueOrderEmail(
      `order:${event.params.orderId}:shipped`,
      next.customer.email,
      "Your order has shipped",
      text,
    );
    logger.info("onOrderFulfilled done", { orderId: event.data!.after.id });
  },
);
