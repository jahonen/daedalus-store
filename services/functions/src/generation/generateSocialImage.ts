import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { mediaAssetSchema } from "@daedalus/shared";
import { z } from "zod";
import { bucket, db } from "../admin.js";
import { generateImage } from "../ai/gemini.js";
import { requireAdmin } from "../lib/auth.js";
import { publicUrlFor } from "../lib/storage.js";

const inputSchema = z.object({
  prompt: z.string().min(3),
  altText: z.string().default(""),
});

/**
 * Lifecycle: alpha — generates a social-post image (editorial style, not
 * product-catalog framing) → public/social/ + a media doc for reuse.
 * Same Gemini image pipeline as generateProductImage.
 */
export const generateSocialImage = onCall(
  { timeoutSeconds: 180, memory: "1GiB" },
  async (req) => {
    requireAdmin(req);
    const parsed = inputSchema.safeParse(req.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", parsed.error.message);
    const { prompt, altText } = parsed.data;
    logger.info("generateSocialImage start");

    const image = await generateImage(
      `Editorial social media photo for an atelier design brand: ${prompt}. ` +
        `Cinematic natural light, authentic lifestyle feel — not a stock product shot.`,
    );

    const path = `public/social/${Date.now()}.png`;
    await bucket.file(path).save(image, {
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

    logger.info("generateSocialImage done", { mediaId: mediaRef.id });
    return { mediaId: mediaRef.id, storagePath: path, url: publicUrl };
  },
);
