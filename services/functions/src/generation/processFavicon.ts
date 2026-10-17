import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { z } from "zod";
import sharp from "sharp";
import { bucket, db } from "../admin.js";

const inputSchema = z.object({ storagePath: z.string().min(1) });

// Deterministic object names → the storefront can reference stable URLs and
// a fresh upload just overwrites them. max-age=300 bounds CDN staleness.
const SIZES: { name: string; size: number; opaque: boolean }[] = [
  { name: "favicon-16.png", size: 16, opaque: false },
  { name: "favicon-32.png", size: 32, opaque: false },
  { name: "favicon-48.png", size: 48, opaque: false },
  { name: "apple-touch-icon.png", size: 180, opaque: true }, // iOS needs opaque
  { name: "icon-192.png", size: 192, opaque: false },
  { name: "icon-512.png", size: 512, opaque: false },
];

/** Resizes an admin-uploaded brand mark into the storefront favicon set. */
export const processFavicon = onCall(async (req) => {
  if (req.auth?.token.admin !== true)
    throw new HttpsError("permission-denied", "admin only");
  const { storagePath } = inputSchema.parse(req.data);
  if (!storagePath.startsWith("uploads/"))
    throw new HttpsError("invalid-argument", "source must be under uploads/");
  logger.info("processFavicon start", { storagePath });

  try {
    const [source] = await bucket.file(storagePath).download();

    for (const { name, size, opaque } of SIZES) {
      let img = sharp(source, { density: 300 });
      if (opaque) img = img.flatten({ background: "#ffffff" });
      const png = await img
        .resize(size, size, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: opaque ? 1 : 0 },
        })
        .png()
        .toBuffer();
      await bucket.file(`public/brand/${name}`).save(png, {
        contentType: "image/png",
        metadata: { cacheControl: "public, max-age=300" },
      });
    }

    await db.collection("settings").doc("branding").set(
      { faviconUpdatedAt: new Date().toISOString() },
      { merge: true },
    );
    await bucket.file(storagePath).delete();
    logger.info("processFavicon done", { storagePath });
  } catch (e) {
    logger.error("processFavicon failed", { error: String(e) });
    throw new HttpsError(
      "internal",
      e instanceof Error ? e.message : "favicon processing failed",
    );
  }
});
