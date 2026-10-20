import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { z } from "zod";
import {
  heritageRegistrySchema,
  HERITAGE_WARRANTY_YEARS,
} from "@daedalus/shared";
import { db } from "../admin.js";
import { requireAdmin } from "../lib/auth.js";

// ── Register serial (called during fulfillment) ─────────────────────────────

const registerInput = z.object({
  serialNumber: z.string().min(1),
  productId: z.string(),
  orderId: z.string(),
  orderItemIndex: z.number().int(),
  ownerName: z.string(),
  ownerEmail: z.string().email(),
  ownerPhone: z.string().default(""),
});

export const registerSerial = onCall(async (req) => {
  requireAdmin(req);
  const input = registerInput.parse(req.data);
  logger.info("registerSerial start", { serial: input.serialNumber });

  // Use serial as doc ID → guarantees uniqueness.
  const ref = db.collection("heritageRegistry").doc(input.serialNumber);
  const existing = await ref.get();
  if (existing.exists) {
    throw new HttpsError("already-exists", `Serial ${input.serialNumber} is already registered`);
  }

  const now = new Date();
  const warrantyExpires = new Date(now);
  warrantyExpires.setFullYear(warrantyExpires.getFullYear() + HERITAGE_WARRANTY_YEARS);

  const record = heritageRegistrySchema.parse({
    ...input,
    classification: "registered",
    ownershipHistory: [
      {
        ownerName: input.ownerName,
        transferredAt: now.toISOString(),
        transferType: "purchase",
        notes: "",
      },
    ],
    registeredAt: now.toISOString(),
    warrantyExpiresAt: warrantyExpires.toISOString(),
  });

  await ref.set(record);
  logger.info("registerSerial done", { serial: input.serialNumber });
  return { heritageId: input.serialNumber };
});

// ── Transfer ownership (concierge → Heirloom) ──────────────────────────────

const transferInput = z.object({
  serialNumber: z.string().min(1),
  newOwnerName: z.string().min(1),
  newOwnerEmail: z.string().email(),
  newOwnerPhone: z.string().default(""),
  notes: z.string().default(""),
});

export const transferOwnership = onCall(async (req) => {
  requireAdmin(req);
  const input = transferInput.parse(req.data);
  logger.info("transferOwnership start", { serial: input.serialNumber });

  const ref = db.collection("heritageRegistry").doc(input.serialNumber);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Serial ${input.serialNumber} not found`);
    }
    const current = heritageRegistrySchema.parse(snap.data());

    tx.update(ref, {
      ownerName: input.newOwnerName,
      ownerEmail: input.newOwnerEmail,
      ownerPhone: input.newOwnerPhone,
      classification: "heirloom",
      ownershipHistory: [
        ...current.ownershipHistory,
        {
          ownerName: input.newOwnerName,
          transferredAt: new Date().toISOString(),
          transferType: "concierge_transfer",
          notes: input.notes,
        },
      ],
    });
  });

  logger.info("transferOwnership done", { serial: input.serialNumber });
  return { ok: true };
});

// ── Lookup ──────────────────────────────────────────────────────────────────

const lookupInput = z.object({
  serialNumber: z.string().min(1),
});

export const getHeritageRecord = onCall(async (req) => {
  requireAdmin(req);
  const { serialNumber } = lookupInput.parse(req.data);
  const snap = await db.collection("heritageRegistry").doc(serialNumber).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Serial ${serialNumber} not found`);
  }
  return { record: { id: snap.id, ...heritageRegistrySchema.parse(snap.data()) } };
});

// ── List ────────────────────────────────────────────────────────────────────

const listInput = z.object({
  productId: z.string().optional(),
  classification: z.enum(["registered", "heirloom"]).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const listHeritageRecords = onCall(async (req) => {
  requireAdmin(req);
  const { productId, classification, limit } = listInput.parse(req.data ?? {});
  logger.info("listHeritageRecords start", { productId, classification, limit });

  let q: FirebaseFirestore.Query = db.collection("heritageRegistry");
  if (productId) q = q.where("productId", "==", productId);
  if (classification) q = q.where("classification", "==", classification);
  q = q.orderBy("registeredAt", "desc").limit(limit);

  const snap = await q.get();
  const records = snap.docs.map((d) => ({
    id: d.id,
    ...heritageRegistrySchema.parse(d.data()),
  }));

  logger.info("listHeritageRecords done", { count: records.length });
  return { records };
});
