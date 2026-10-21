import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { z } from "zod";
import { emailContentSchema, productSchema } from "@daedalus/shared";
import { requireAdmin } from "../lib/auth.js";
import { loadGenerationContext } from "../lib/strategy.js";
import { generateText } from "../ai/gemini.js";
import { db } from "../admin.js";

export const chatDraftEmail = onCall({ timeoutSeconds: 120, memory: "512MiB" }, async (req) => {
  requireAdmin(req);
  const input = z
    .object({
      message: z.string().min(1).max(4000),
      history: z
        .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(6000) }))
        .max(20)
        .default([]),
    })
    .parse(req.data);
  logger.info("chatDraftEmail start");
  const ctx = await loadGenerationContext();
  const products = await db
    .collection("products")
    .where("status", "in", ["active", "draft"])
    .limit(100)
    .get();
  const catalog = products.docs.map((doc) => {
    const p = productSchema.parse(doc.data());
    return {
      name: p.name,
      description: p.description,
      status: p.status,
      url: p.status === "active" ? `${ctx.company.siteUrl}/products/${p.slug}` : undefined,
    };
  });
  const raw = await generateText({
    prompt: `Draft an editorial newsletter for ${ctx.brandName}, language ${ctx.locale}. Use only supplied facts. No invented prices, discounts, scarcity or testimonials. Draft products are upcoming, never buyable. Archived products are excluded. No recipient information is provided. Never dispatch email. Return JSON {reply:string, content:{subject:string,preheader:string,blocks:[{type:'heading'|'paragraph'|'button',text:string,url?:string}]}}. Buttons require real HTTPS URLs. Subject under 60 characters, preheader under 100, concise paragraphs. Strategy: ${JSON.stringify({ icps: ctx.icps, insights: ctx.insights })}. Catalog: ${JSON.stringify(catalog)}. Conversation: ${JSON.stringify(input.history)}. Request: ${input.message}`,
    responseJsonSchema: {
      type: "object",
      properties: {
        reply: { type: "string" },
        content: {
          type: "object",
          properties: {
            subject: { type: "string" },
            preheader: { type: "string" },
            blocks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["heading", "paragraph", "button"] },
                  text: { type: "string" },
                  url: { type: "string" },
                },
                required: ["type", "text"],
              },
            },
          },
          required: ["subject", "preheader", "blocks"],
        },
      },
      required: ["reply", "content"],
    },
    temperature: 0.7,
  });
  try {
    const out = z.object({ reply: z.string(), content: emailContentSchema }).parse(JSON.parse(raw));
    logger.info("chatDraftEmail done");
    return out;
  } catch {
    throw new HttpsError("internal", "Draft could not be validated; please try again");
  }
});
