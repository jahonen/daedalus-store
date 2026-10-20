import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { z } from "zod";
import { repairRecordSchema, heritageRegistrySchema } from "@daedalus/shared";
import { db } from "../admin.js";
import { requireAdmin } from "../lib/auth.js";

// ── Create ──────────────────────────────────────────────────────────────────

const createInput = z.object({
  serialNumber: z.string().min(1),
  warrantyType: z.enum(["lifetime", "premium"]),
  description: z.string().min(1),
  technician: z.string().default(""),
});

export const createRepairRecord = onCall(async (req) => {
  requireAdmin(req);
  const input = createInput.parse(req.data);
  logger.info("createRepairRecord start", { serial: input.serialNumber });

  // Validate heritage record exists.
  const heritageSnap = await db
    .collection("heritageRegistry")
    .doc(input.serialNumber)
    .get();
  if (!heritageSnap.exists) {
    throw new HttpsError("not-found", `Serial ${input.serialNumber} not found in heritage registry`);
  }
  const heritage = heritageRegistrySchema.parse(heritageSnap.data());

  // For lifetime warranty, check warranty is still active.
  if (input.warrantyType === "lifetime") {
    if (new Date(heritage.warrantyExpiresAt) < new Date()) {
      throw new HttpsError(
        "failed-precondition",
        `Lifetime warranty expired on ${heritage.warrantyExpiresAt}`,
      );
    }
  }

  const record = repairRecordSchema.parse({
    heritageId: input.serialNumber,
    serialNumber: input.serialNumber,
    productId: heritage.productId,
    status: "requested",
    warrantyType: input.warrantyType,
    description: input.description,
    technician: input.technician,
    createdAt: new Date().toISOString(),
  });

  const ref = await db.collection("repairRecords").add(record);
  logger.info("createRepairRecord done", { repairId: ref.id });
  return { repairId: ref.id };
});

// ── Update ──────────────────────────────────────────────────────────────────

const updateInput = z.object({
  repairId: z.string(),
  status: z.enum(["requested", "received", "in_progress", "completed", "returned"]).optional(),
  repairNotes: z.string().optional(),
  partsUsed: z.array(z.string()).optional(),
  technician: z.string().optional(),
  costCents: z.number().int().nonnegative().optional(),
  beforeMediaIds: z.array(z.string()).optional(),
  afterMediaIds: z.array(z.string()).optional(),
  inboundCarrier: z.string().optional(),
  inboundTracking: z.string().optional(),
  outboundCarrier: z.string().optional(),
  outboundTracking: z.string().optional(),
});

export const updateRepairRecord = onCall(async (req) => {
  requireAdmin(req);
  const { repairId, ...fields } = updateInput.parse(req.data);
  logger.info("updateRepairRecord start", { repairId });

  const ref = db.collection("repairRecords").doc(repairId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Repair record ${repairId} not found`);
  }

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) update[k] = v;
  }
  if (update.status === "completed" || update.status === "returned") {
    update.completedAt = new Date().toISOString();
  }

  if (Object.keys(update).length > 0) {
    await ref.update(update);
  }

  logger.info("updateRepairRecord done", { repairId });
  return { ok: true };
});

// ── List ────────────────────────────────────────────────────────────────────

const listInput = z.object({
  serialNumber: z.string().optional(),
  status: z.enum(["requested", "received", "in_progress", "completed", "returned"]).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const listRepairRecords = onCall(async (req) => {
  requireAdmin(req);
  const { serialNumber, status, limit } = listInput.parse(req.data ?? {});
  logger.info("listRepairRecords start", { serialNumber, status, limit });

  let q: FirebaseFirestore.Query = db.collection("repairRecords");
  if (serialNumber) q = q.where("serialNumber", "==", serialNumber);
  if (status) q = q.where("status", "==", status);
  q = q.orderBy("createdAt", "desc").limit(limit);

  const snap = await q.get();
  const records = snap.docs.map((d) => ({
    id: d.id,
    ...repairRecordSchema.parse(d.data()),
  }));

  logger.info("listRepairRecords done", { count: records.length });
  return { records };
});
