import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { storefrontPageSchema } from "@daedalus/shared";
import { z } from "zod";
import { db } from "../admin.js";
import { generateText } from "../ai/gemini.js";
import {
  SINGLE_BLOCK_SCHEMA,
  SYSTEM_INSTRUCTION,
  chatEditPrompt,
} from "../ai/prompts.js";
import { loadGenerationContext } from "../lib/strategy.js";

const inputSchema = z.object({
  pageSlug: z.string(),
  blockId: z.string(),
  message: z.string().min(1),
});

/** Applies a natural-language edit command to a single block (ambient chat). */
export const chatEditBlock = onCall(async (req) => {
  if (req.auth?.token.admin !== true) throw new HttpsError("permission-denied", "admin only");
  const { pageSlug, blockId, message } = inputSchema.parse(req.data);
  logger.info("chatEditBlock start", { pageSlug, blockId });

  const pageRef = db.collection("storefrontPages").doc(pageSlug);
  const pageSnap = await pageRef.get();
  if (!pageSnap.exists) throw new HttpsError("not-found", `page ${pageSlug}`);
  const page = storefrontPageSchema.parse(pageSnap.data());

  const idx = page.blocks.findIndex((b) => b.id === blockId);
  if (idx < 0) throw new HttpsError("not-found", `block ${blockId}`);
  const block = page.blocks[idx];

  const ctx = await loadGenerationContext();
  const raw = await generateText({
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt: chatEditPrompt({ block, message, locale: ctx.locale }),
    responseJsonSchema: SINGLE_BLOCK_SCHEMA,
    temperature: 0.6,
  });
  const updated = z
    .object({ headline: z.string(), body: z.string() })
    .parse(JSON.parse(raw));

  page.blocks[idx] = {
    ...block,
    ...updated,
    // Chat-directed edits are protected from bulk regeneration like manual edits.
    manuallyEdited: true,
    version: block.version + 1,
  };
  await pageRef.set({ ...page, updatedAt: new Date().toISOString() });
  logger.info("chatEditBlock done", { pageSlug, blockId });
  return { block: page.blocks[idx] };
});
