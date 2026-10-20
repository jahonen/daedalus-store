import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { storefrontPageSchema } from "@daedalus/shared";
import { z } from "zod";
import { db } from "../admin.js";
import { generateText } from "../ai/gemini.js";
import {
  SINGLE_BLOCK_SCHEMA,
  SYSTEM_INSTRUCTION,
  regenerateBlockPrompt,
} from "../ai/prompts.js";
import { requireAdmin } from "../lib/auth.js";
import { loadGenerationContext } from "../lib/strategy.js";

const inputSchema = z.object({ pageSlug: z.string(), blockId: z.string() });

/** Re-generates one block with refreshed strategy/product context. */
export const regenerateBlock = onCall(
  { timeoutSeconds: 120, memory: "512MiB" },
  async (req) => {
  requireAdmin(req);
  const parsed = inputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", parsed.error.message);
  const { pageSlug, blockId } = parsed.data;
  logger.info("regenerateBlock start", { pageSlug, blockId });

  const pageRef = db.collection("storefrontPages").doc(pageSlug);

  // Read page + block outside the tx to build the Gemini prompt.
  const pageSnap = await pageRef.get();
  if (!pageSnap.exists) throw new HttpsError("not-found", `page ${pageSlug}`);
  const page = storefrontPageSchema.parse(pageSnap.data());
  const idx = page.blocks.findIndex((b) => b.id === blockId);
  if (idx < 0) throw new HttpsError("not-found", `block ${blockId}`);
  const block = page.blocks[idx];

  // Gemini call happens BEFORE the transaction.
  const ctx = await loadGenerationContext();
  const raw = await generateText({
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt: regenerateBlockPrompt({
      ...ctx,
      blockType: block.type,
      current: { headline: block.headline, body: block.body },
      page: pageSlug,
    }),
    responseJsonSchema: SINGLE_BLOCK_SCHEMA,
    temperature: 0.9,
  });
  let rawJson: unknown;
  try { rawJson = JSON.parse(raw); } catch {
    throw new HttpsError("internal", "AI returned invalid JSON");
  }
  const updated = z
    .object({ headline: z.string(), body: z.string() })
    .parse(rawJson);

  // Apply inside a transaction to avoid overwriting concurrent edits.
  let resultBlock;
  await db.runTransaction(async (tx) => {
    const freshSnap = await tx.get(pageRef);
    if (!freshSnap.exists) throw new HttpsError("not-found", `page ${pageSlug}`);
    const freshPage = storefrontPageSchema.parse(freshSnap.data());
    const freshIdx = freshPage.blocks.findIndex((b) => b.id === blockId);
    if (freshIdx < 0) throw new HttpsError("not-found", `block ${blockId}`);

    freshPage.blocks[freshIdx] = {
      ...freshPage.blocks[freshIdx],
      ...updated,
      manuallyEdited: false,
      version: freshPage.blocks[freshIdx].version + 1,
    };
    resultBlock = freshPage.blocks[freshIdx];
    tx.set(pageRef, { ...freshPage, updatedAt: new Date().toISOString() });
  });
  logger.info("regenerateBlock done", { pageSlug, blockId });
  return { block: resultBlock };
});
