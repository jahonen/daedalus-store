import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { mediaAssetSchema } from "@daedalus/shared";
import { z } from "zod";
import { bucket, db } from "../admin.js";
import { generateImage } from "../ai/gemini.js";

const inputSchema = z.object({
  productId: z.string(),
  prompt: z.string().min(3),
  altText: z.string().default(""),
});

/** Generates product/lifestyle imagery → Storage public/ + media doc. */
export const generateProductImage = onCall(async (req) => {
  if (req.auth?.token.admin !== true) throw new HttpsError("permission-denied", "admin only");
  const { productId, prompt, altText } = inputSchema.parse(req.data);
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
  await file.makePublic();
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;

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

  logger.info("generateProductImage done", { productId, mediaId: mediaRef.id });
  return { mediaId: mediaRef.id, url: publicUrl };
});
