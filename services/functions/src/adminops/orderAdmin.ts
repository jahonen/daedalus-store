import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { orderSchema } from "@daedalus/shared";
import { z } from "zod";
import { db } from "../admin.js";

function requireAdmin(req: { auth?: { token: Record<string, unknown> } | null }) {
  if (req.auth?.token.admin !== true) {
    throw new HttpsError("permission-denied", "admin only");
  }
}

const listInputSchema = z.object({
  status: z.enum(["PENDING_FULFILLMENT", "FULFILLED", "CANCELLED"]).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

/** Admin order list (orders collection is server-only per Firestore rules). */
export const listOrders = onCall(async (req) => {
  requireAdmin(req);
  const { status, limit } = listInputSchema.parse(req.data ?? {});
  logger.info("listOrders start", { status, limit });

  let q: FirebaseFirestore.Query = db
    .collection("orders")
    .orderBy("createdAt", "desc")
    .limit(limit);
  if (status) q = q.where("status", "==", status);
  const snap = await q.get();
  const orders = snap.docs.map((d) => ({ id: d.id, ...orderSchema.parse(d.data()) }));

  logger.info("listOrders done", { count: orders.length });
  return { orders };
});

const fulfillInputSchema = z.object({
  orderId: z.string(),
  carrier: z.string().min(1),
  trackingNumber: z.string().min(1),
});

/**
 * Marks an order FULFILLED with carrier/tracking. The write triggers
 * onOrderFulfilled, which emails the customer tracking details.
 */
export const markOrderFulfilled = onCall(async (req) => {
  requireAdmin(req);
  const { orderId, carrier, trackingNumber } = fulfillInputSchema.parse(req.data);
  logger.info("markOrderFulfilled start", { orderId });

  const ref = db.collection("orders").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", `order ${orderId}`);
  const order = orderSchema.parse(snap.data());
  if (order.status !== "PENDING_FULFILLMENT") {
    throw new HttpsError("failed-precondition", `order is ${order.status}`);
  }

  await ref.update({
    status: "FULFILLED",
    carrier,
    trackingNumber,
    fulfilledAt: new Date().toISOString(),
  });
  logger.info("markOrderFulfilled done", { orderId });
  return { ok: true };
});
