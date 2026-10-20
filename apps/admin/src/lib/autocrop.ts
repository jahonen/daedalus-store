/**
 * Smart center-crop to 1:1.
 *
 * Lifecycle: beta — client-side image preprocessing for product uploads.
 *
 * Algorithm:
 * 1. Load the image into an OffscreenCanvas.
 * 2. Find the shorter dimension → that becomes the square side.
 * 3. Center-crop from the longer dimension.
 * 4. Scale down to maxSize if necessary (saves bandwidth, Storage costs).
 * 5. Return the cropped image as a Blob (JPEG at 0.92 quality or PNG for
 *    transparency).
 */

const MAX_SIZE = 1200;

/**
 * Smart center-crop to an arbitrary aspect ratio ("4:3", "1:1") or just a
 * scale-down when aspect is "original". Same canvas math as autocropSquare.
 * Lifecycle: beta.
 */
export async function autocropTo(
  file: File | Blob,
  aspect: "4:3" | "1:1" | "original",
  maxEdge = 1600,
  forceMime?: "image/jpeg" | "image/png",
): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const { width: w, height: h } = bmp;

  let sw = w, sh = h, sx = 0, sy = 0;
  if (aspect !== "original") {
    const [aw, ah] = aspect.split(":").map(Number);
    const target = aw / ah;
    if (w / h > target) {
      sh = h;
      sw = Math.round(h * target);
      sx = Math.round((w - sw) / 2);
    } else {
      sw = w;
      sh = Math.round(w / target);
      sy = Math.round((h - sh) / 2);
    }
  }

  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const ow = Math.round(sw * scale);
  const oh = Math.round(sh * scale);

  const canvas = new OffscreenCanvas(ow, oh);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, ow, oh);
  bmp.close();

  const mime = forceMime ?? (file.type === "image/png" ? "image/png" : "image/jpeg");
  const blob = await canvas.convertToBlob({
    type: mime,
    quality: mime === "image/jpeg" ? 0.88 : undefined,
  });
  return { blob, width: ow, height: oh };
}

export async function autocropSquare(
  file: File,
  maxSize = MAX_SIZE,
): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const { width, height } = bmp;

  // Square side = shorter dimension.
  const side = Math.min(width, height);
  // Center offset on the longer axis.
  const sx = Math.round((width - side) / 2);
  const sy = Math.round((height - side) / 2);

  // Scale to maxSize if the crop is larger.
  const out = Math.min(side, maxSize);

  const canvas = new OffscreenCanvas(out, out);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, out, out);
  bmp.close();

  // Preserve PNG for transparency; everything else → JPEG for size.
  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  const quality = mime === "image/jpeg" ? 0.92 : undefined;
  return canvas.convertToBlob({ type: mime, quality });
}
