import { onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { z } from "zod";
import { artisanSchema } from "@daedalus/shared";
import { db } from "../admin.js";
import { requireAdmin } from "../lib/auth.js";

// ── Save (create / update) ──────────────────────────────────────────────────

const saveInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  bio: z.string().default(""),
  specialties: z.array(z.string()).default([]),
  location: z.string().default(""),
  mediaAssetIds: z.array(z.string()).default([]),
  status: z.enum(["active", "archived"]).default("active"),
});

export const saveArtisan = onCall(async (req) => {
  requireAdmin(req);
  const { id, ...fields } = saveInput.parse(req.data);
  logger.info("saveArtisan start", { id });

  const artisan = artisanSchema.parse(fields);

  if (id) {
    await db.collection("artisans").doc(id).set(artisan, { merge: true });
    logger.info("saveArtisan updated", { id });
    return { id };
  }

  const ref = await db.collection("artisans").add(artisan);
  logger.info("saveArtisan created", { id: ref.id });
  return { id: ref.id };
});

// ── List ────────────────────────────────────────────────────────────────────

export const listArtisans = onCall(async (req) => {
  requireAdmin(req);
  logger.info("listArtisans start");

  const snap = await db.collection("artisans").get();
  const artisans = snap.docs.map((d) => ({
    id: d.id,
    ...artisanSchema.parse(d.data()),
  }));

  logger.info("listArtisans done", { count: artisans.length });
  return { artisans };
});
