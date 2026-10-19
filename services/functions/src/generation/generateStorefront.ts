import { randomUUID } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import {
  mediaAssetSchema,
  storefrontBlockSchema,
  storefrontPageSchema,
} from "@daedalus/shared";
import { z } from "zod";
import { bucket, db } from "../admin.js";
import { generateImage, generateText } from "../ai/gemini.js";
import {
  BLOCK_LIST_SCHEMA,
  SYSTEM_INSTRUCTION,
  storefrontPrompt,
} from "../ai/prompts.js";
import { requireAdmin } from "../lib/auth.js";
import { publicUrlFor } from "../lib/storage.js";
import { loadGenerationContext } from "../lib/strategy.js";

const inputSchema = z.object({ pageSlug: z.string().default("home") });

/** Generates a full 5-phase storefront page draft from strategy inputs. */
export const generateStorefront = onCall(
  { timeoutSeconds: 300, memory: "1GiB" },
  async (req) => {
  requireAdmin(req);
  const parsed = inputSchema.safeParse(req.data ?? {});
  if (!parsed.success) throw new HttpsError("invalid-argument", parsed.error.message);
  const { pageSlug } = parsed.data;
  logger.info("generateStorefront start", { pageSlug });

  const ctx = await loadGenerationContext();
  const raw = await generateText({
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt: storefrontPrompt(ctx),
    responseJsonSchema: BLOCK_LIST_SCHEMA,
    temperature: 0.8,
  });

  let rawJson: unknown;
  try { rawJson = JSON.parse(raw); } catch {
    throw new HttpsError("internal", "AI returned invalid JSON");
  }
  const blocksParsed = z
    .array(storefrontBlockSchema.omit({ id: true }).partial({ mediaAssetIds: true }))
    .parse(rawJson);

  const blocks = blocksParsed.map((b, i) =>
    storefrontBlockSchema.parse({ ...b, id: `block-${i + 1}-${randomUUID().slice(0, 8)}` }),
  );

  // Gemini only emits copy — wire the spotlight block to product imagery.
  const spotlightIdx = blocks.findIndex((b) => b.type === "spotlight");
  const heroProduct = ctx.products.find((p) => p.mediaAssetIds.length > 0);
  if (spotlightIdx >= 0 && heroProduct) {
    blocks[spotlightIdx] = {
      ...blocks[spotlightIdx],
      mediaAssetIds: heroProduct.mediaAssetIds,
    };
  }

  // Wide hero art for the hook block — non-fatal so a failed image call
  // can't take down page generation.
  const hookIdx = blocks.findIndex((b) => b.type === "hook");
  if (hookIdx >= 0) {
    try {
      const heroPrompt =
        `Wide editorial hero photograph for ${ctx.brandName}. ` +
        `${blocks[hookIdx].headline}. Premium minimalist Nordic aesthetic, ` +
        `soft natural light, high-end e-commerce campaign imagery, ` +
        `no text or typography.`;
      const image = await generateImage(heroPrompt);
      const path = `public/pages/${pageSlug}/${Date.now()}.png`;
      await bucket.file(path).save(image, {
        contentType: "image/png",
        metadata: { cacheControl: "public, max-age=31536000, immutable" },
      });
      const publicUrl = publicUrlFor(path);
      const mediaRef = await db.collection("media").add(
        mediaAssetSchema.parse({
          storagePath: path,
          publicUrl,
          kind: "generated",
          prompt: heroPrompt,
          altText: blocks[hookIdx].headline,
          createdAt: new Date().toISOString(),
        }),
      );
      blocks[hookIdx] = { ...blocks[hookIdx], mediaAssetIds: [mediaRef.id] };
    } catch (e) {
      logger.warn("hero image generation failed", { error: `${e}` });
    }
  }

  // Preserve publication state — regenerating a live page shouldn't take the
  // store offline. New pages start as drafts.
  const pageRef = db.collection("storefrontPages").doc(pageSlug);
  const existing = await pageRef.get();
  const status = existing.exists
    ? storefrontPageSchema.parse(existing.data()).status
    : "draft";

  const page = storefrontPageSchema.parse({
    slug: pageSlug,
    title: ctx.brandName,
    blocks,
    status,
    updatedAt: new Date().toISOString(),
  });

  await pageRef.set(page);
  logger.info("generateStorefront done", { pageSlug, blocks: blocks.length });
  return { pageSlug, blocks };
});
