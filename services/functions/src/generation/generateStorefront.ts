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

  const page = storefrontPageSchema.parse({
    slug: pageSlug,
    title: ctx.brandName,
    blocks,
    status: "draft",
    updatedAt: new Date().toISOString(),
  });

  await db.collection("storefrontPages").doc(pageSlug).set(page);
  logger.info("generateStorefront done", { pageSlug, blocks: blocks.length });
  return { pageSlug, blocks };
});
