import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import {
  orderSchema,
  heritageRegistrySchema,
  HERITAGE_WARRANTY_YEARS,
} from "@daedalus/shared";
import { z } from "zod";
import { db } from "../admin.js";
import { requireAdmin } from "../lib/auth.js";

const listInputSchema = z.object({
  status: z.enum(["PENDING_FULFILLMENT", "FULFILLED", "CANCELLED", "REFUNDED"]).optional(),
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

const serialAssignmentSchema = z.object({
  orderItemIndex: z.number().int(),
  serialNumber: z.string().min(1),
  ownerPhone: z.string().default(""),
});

const fulfillInputSchema = z.object({
  orderId: z.string(),
  carrier: z.string().min(1),
  trackingNumber: z.string().min(1),
  serialAssignments: z.array(serialAssignmentSchema).default([]),
});

/**
 * Marks an order FULFILLED with carrier/tracking. The write triggers
 * onOrderFulfilled, which emails the customer tracking details.
 */
export const markOrderFulfilled = onCall(async (req) => {
  requireAdmin(req);
  const { orderId, carrier, trackingNumber, serialAssignments } =
    fulfillInputSchema.parse(req.data);
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

  // Register heritage records for each serial assignment.
  const now = new Date();
  const warrantyExpires = new Date(now);
  warrantyExpires.setFullYear(warrantyExpires.getFullYear() + HERITAGE_WARRANTY_YEARS);

  for (const sa of serialAssignments) {
    const existingSerial = await db
      .collection("heritageRegistry")
      .doc(sa.serialNumber)
      .get();
    if (existingSerial.exists) {
      logger.warn("serial already registered, skipping", { serial: sa.serialNumber });
      continue;
    }

    const item = order.items[sa.orderItemIndex];
    if (!item) {
      logger.warn("invalid orderItemIndex, skipping", { index: sa.orderItemIndex });
      continue;
    }

    const record = heritageRegistrySchema.parse({
      serialNumber: sa.serialNumber,
      productId: item.productId,
      orderId,
      orderItemIndex: sa.orderItemIndex,
      ownerName: order.customer.name ?? "",
      ownerEmail: order.customer.email,
      ownerPhone: sa.ownerPhone,
      classification: "registered",
      ownershipHistory: [
        {
          ownerName: order.customer.name ?? order.customer.email,
          transferredAt: now.toISOString(),
          transferType: "purchase",
          notes: "",
        },
      ],
      registeredAt: now.toISOString(),
      warrantyExpiresAt: warrantyExpires.toISOString(),
    });

    await db.collection("heritageRegistry").doc(sa.serialNumber).set(record);
    logger.info("heritage registered", { serial: sa.serialNumber, orderId });
  }

  logger.info("markOrderFulfilled done", { orderId, serials: serialAssignments.length });
  return { ok: true };
});
