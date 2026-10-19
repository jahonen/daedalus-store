import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { mediaAssetSchema } from "@daedalus/shared";
import { z } from "zod";
import { bucket, db } from "../admin.js";
import { generateImage } from "../ai/gemini.js";
import { revalidateToken } from "../config.js";
import { requireAdmin } from "../lib/auth.js";
import { publicUrlFor } from "../lib/storage.js";
import { revalidateStorefront } from "../lib/storefront.js";

const inputSchema = z.object({
  productId: z.string(),
  prompt: z.string().min(3),
  altText: z.string().default(""),
});

/** Generates product/lifestyle imagery → Storage public/ + media doc. */
export const generateProductImage = onCall(
  { secrets: [revalidateToken], timeoutSeconds: 180, memory: "1GiB" },
  async (req) => {
  requireAdmin(req);
  const parsed = inputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", parsed.error.message);
  const { productId, prompt, altText } = parsed.data;
  logger.info("generateProductImage start", { productId });

  const image = await generateImage(
    `Professional e-commerce product photography: ${prompt}. Clean studio background, soft natural light, photorealistic.`,
  );

  const path = `public/products/${productId}/${Date.now()}.png`;
  const file = bucket.file(path);
  await file.save(image, {
    contentType: "image/png",
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
  });
  const publicUrl = publicUrlFor(path);

  const media = mediaAssetSchema.parse({
    storagePath: path,
    publicUrl,
    kind: "generated",
    prompt,
    altText,
    createdAt: new Date().toISOString(),
  });
  const mediaRef = await db.collection("media").add(media);
  await db
    .collection("products")
    .doc(productId)
    .update({ mediaAssetIds: FieldValue.arrayUnion(mediaRef.id) });

  await revalidateStorefront("products");
  await revalidateStorefront("media");
  logger.info("generateProductImage done", { productId, mediaId: mediaRef.id });
  return { mediaId: mediaRef.id, url: publicUrl };
},
);
