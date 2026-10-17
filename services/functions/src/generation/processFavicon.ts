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

// Background keying: pixels within T0 of the sampled background colour become
// fully transparent; the T0→T1 band fades out, giving anti-aliased edges a
// smooth ramp instead of a hard halo.
const KEY_T0 = 30;
const KEY_T1 = 70;

/** Chroma-key pixels close to the sampled corner colour to transparency. */
async function keyBackground(source: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(source, { density: 300 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const px = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const corner = 4; // sample a small square in each corner for stability
  const samples: number[][] = [];
  for (const [cx, cy] of [
    [0, 0],
    [width - corner, 0],
    [0, height - corner],
    [width - corner, height - corner],
  ])
    for (let y = cy; y < cy + corner; y++)
      for (let x = cx; x < cx + corner; x++) samples.push(px(x, y));
  const bg = [0, 1, 2].map(
    (c) => samples.reduce((a, p) => a + p[c], 0) / samples.length,
  );

  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - bg[0];
    const dg = data[i + 1] - bg[1];
    const db = data[i + 2] - bg[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < KEY_T0) data[i + 3] = 0;
    else if (dist < KEY_T1)
      data[i + 3] = Math.round(255 * ((dist - KEY_T0) / (KEY_T1 - KEY_T0)));
  }
  return sharp(data, {
    raw: { width, height, channels: 4 as const },
  })
    .png()
    .toBuffer();
}

/** Returns true when all four corners are (near-)transparent. */
async function cornersClear(source: Buffer): Promise<boolean> {
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  return [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ].every(([x, y]) => data[(y * width + x) * 4 + 3] < 16);
}

/**
 * Key + trim until the edges are transparent. Handles nested uniform
 * backdrops (canvas + inset tile) that defeat a single pass.
 */
async function clean(source: Buffer): Promise<Buffer> {
  let buf = source;
  for (let round = 0; round < 4; round++) {
    const keyed = await keyBackground(buf);
    const trimmed = await sharp(keyed).trim({ threshold: 10 }).toBuffer();
    if (await cornersClear(trimmed)) return trimmed;
    buf = trimmed;
  }
  return buf;
}

/** Resizes an admin-uploaded brand mark into the storefront favicon/logo set. */
export const processFavicon = onCall(async (req) => {
  if (req.auth?.token.admin !== true)
    throw new HttpsError("permission-denied", "admin only");
  const { storagePath } = inputSchema.parse(req.data);
  if (!storagePath.startsWith("uploads/"))
    throw new HttpsError("invalid-argument", "source must be under uploads/");
  logger.info("processFavicon start", { storagePath });

  try {
    const [source] = await bucket.file(storagePath).download();

    // Key out backdrop(s), then trim — transparent borders always crop
    // tight even when the original background was noisy (JPEG artifacts).
    const cleaned = await clean(source);
    const trimmed = sharp(cleaned);

    const save = async (name: string, buf: Buffer) =>
      bucket.file(`public/brand/${name}`).save(buf, {
        contentType: "image/png",
        metadata: { cacheControl: "public, max-age=300" },
      });

    // Full-size transparent logo for the site header.
    await save(
      "logo.png",
      await trimmed
        .clone()
        .resize({
          width: 1024,
          height: 1024,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer(),
    );

    for (const { name, size, opaque } of SIZES) {
      let img = trimmed.clone();
      if (opaque) img = img.flatten({ background: "#ffffff" });
      const png = await img
        .resize(size, size, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: opaque ? 1 : 0 },
        })
        .png()
        .toBuffer();
      await save(name, png);
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
