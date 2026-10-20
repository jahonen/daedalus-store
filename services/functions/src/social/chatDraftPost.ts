import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { z } from "zod";
import { generateText } from "../ai/gemini.js";
import { socialPostPrompt, SOCIAL_POST_SCHEMA } from "../ai/prompts.js";
import { requireAdmin } from "../lib/auth.js";
import { loadGenerationContext } from "../lib/strategy.js";
import { storeBaseUrl } from "../config.js";
import { graphemeCount } from "./bluesky.js";

const inputSchema = z.object({
  message: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() }))
    .max(40)
    .default([]),
});

const replySchema = z.object({
  reply: z.string(),
  draft: z.object({ text: z.string() }).nullish(),
});

/**
 * Lifecycle: alpha — AI-assisted Bluesky drafting. Strategy context (ICPs,
 * insights) and live product URLs feed every generation; the draft comes
 * back with its grapheme count so the UI can enforce the 300 limit.
 */
export const chatDraftPost = onCall(
  { timeoutSeconds: 120, memory: "512MiB" },
  async (req) => {
    requireAdmin(req);
    const parsed = inputSchema.safeParse(req.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", parsed.error.message);
    const { message, history } = parsed.data;
    logger.info("chatDraftPost start");

    const ctx = await loadGenerationContext();
    // Admin-configured production URL (Settings → Site) wins; env param fallback.
    const base = (ctx.company.siteUrl || storeBaseUrl.value()).replace(/\/$/, "");
    const products = ctx.products.map((p) => ({
      name: p.name,
      url: `${base}/products/${p.slug}`,
    }));

    const raw = await generateText({
      prompt: socialPostPrompt({
        brandName: ctx.brandName,
        icps: ctx.icps,
        insights: ctx.insights,
        products,
        history,
        message,
        locale: ctx.locale,
      }),
      responseJsonSchema: SOCIAL_POST_SCHEMA,
      temperature: 0.8,
    });

    let out: z.infer<typeof replySchema>;
    try {
      out = replySchema.parse(JSON.parse(raw));
    } catch {
      throw new HttpsError("internal", "AI returned invalid JSON");
    }

    const draft = out.draft?.text
      ? { text: out.draft.text, graphemes: graphemeCount(out.draft.text) }
      : null;
    logger.info("chatDraftPost done", { hasDraft: !!draft, graphemes: draft?.graphemes });
    return { reply: out.reply, draft };
  },
);
