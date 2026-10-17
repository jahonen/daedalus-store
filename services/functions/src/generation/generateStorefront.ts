import { randomUUID } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { storefrontBlockSchema, storefrontPageSchema } from "@daedalus/shared";
import { z } from "zod";
import { db } from "../admin.js";
import { generateText } from "../ai/gemini.js";
import {
  BLOCK_LIST_SCHEMA,
  SYSTEM_INSTRUCTION,
  storefrontPrompt,
} from "../ai/prompts.js";
import { loadGenerationContext } from "../lib/strategy.js";

const inputSchema = z.object({ pageSlug: z.string().default("home") });

/** Generates a full 5-phase storefront page draft from strategy inputs. */
export const generateStorefront = onCall(async (req) => {
  if (req.auth?.token.admin !== true) throw new HttpsError("permission-denied", "admin only");
  const { pageSlug } = inputSchema.parse(req.data ?? {});
  logger.info("generateStorefront start", { pageSlug });

  const ctx = await loadGenerationContext();
  const raw = await generateText({
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt: storefrontPrompt(ctx),
    responseJsonSchema: BLOCK_LIST_SCHEMA,
    temperature: 0.8,
  });

  const parsed = z
    .array(storefrontBlockSchema.omit({ id: true }).partial({ mediaAssetIds: true }))
    .parse(JSON.parse(raw));

  const blocks = parsed.map((b, i) =>
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
