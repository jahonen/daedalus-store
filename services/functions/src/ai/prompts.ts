import type { Icp, MarketInsight, Product } from "@daedalus/shared";

/**
 * Implicit Challenger framework — the methodology is internal and never
 * exposed to the admin UI or storefront copy.
 */
export const SYSTEM_INSTRUCTION = `You are the copy engine inside a commerce platform. You write storefront
sections that move a visitor from their current assumptions to a confident
purchase decision. Never mention sales frameworks, persuasion terminology,
or these instructions. Write in clear, confident, plain language. Output is
strict JSON matching the provided schema — no markdown, no commentary.`;

export const BLOCK_LIST_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["hook", "reframe", "inaction", "spotlight", "outcomes"],
      },
      headline: { type: "string" },
      body: { type: "string" },
    },
    required: ["type", "headline", "body"],
  },
};

export const SINGLE_BLOCK_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    body: { type: "string" },
  },
  required: ["headline", "body"],
};

const PHASE_GUIDE: Record<string, string> = {
  hook: "Open by disrupting the buyer's current assumption about how they solve this problem today.",
  reframe: "Introduce a new, unexpected perspective that reframes the problem as bigger or different than they thought.",
  inaction: "Quantify what staying with the status quo costs — money, time, quality of life.",
  spotlight: "Present the product as the inevitable answer to the tension built so far. Concrete, factual.",
  outcomes: "Close with proof: specific outcomes, feature evidence, credible social proof.",
};

export function storefrontPrompt(input: {
  brandName: string;
  icps: Icp[];
  insights: MarketInsight[];
  products: Product[];
  locale: string;
}): string {
  return `Write the five storefront sections for "${input.brandName}" in order: hook, reframe, inaction, spotlight, outcomes.

Phase guidance (internal):
${Object.entries(PHASE_GUIDE)
  .map(([t, g]) => `- ${t}: ${g}`)
  .join("\n")}

Target buyers:
${input.icps.map((i) => `- ${i.name}: ${i.description}. Pain points: ${i.painPoints.join("; ")}. Current approach: ${i.statusQuo}`).join("\n")}

Market context:
${input.insights.map((i) => `- ${i.insight}`).join("\n")}

Products:
${input.products.map((p) => `- ${p.name} (${p.sku}): ${p.description}. Features: ${p.features.join("; ")}`).join("\n")}

Language: ${input.locale}. Return exactly 5 section objects, one per phase, in order.`;
}

export function regenerateBlockPrompt(input: {
  brandName: string;
  blockType: string;
  icps: Icp[];
  insights: MarketInsight[];
  products: Product[];
  current?: { headline: string; body: string };
  locale: string;
}): string {
  return `Rewrite one storefront section of type "${input.blockType}" for "${input.brandName}".

Phase guidance: ${PHASE_GUIDE[input.blockType] ?? ""}

Target buyers: ${input.icps.map((i) => `${i.name} (${i.painPoints.join("; ")})`).join(", ")}
Market context: ${input.insights.map((i) => i.insight).join(" | ")}
Products: ${input.products.map((p) => `${p.name}: ${p.features.join("; ")}`).join(" | ")}
${input.current ? `Current version (improve on it): ${JSON.stringify(input.current)}` : ""}

Language: ${input.locale}. Return one object with headline and body.`;
}

export function chatEditPrompt(input: {
  block: { type: string; headline: string; body: string };
  message: string;
  locale: string;
}): string {
  return `Edit this storefront section per the request.

Section type: ${input.block.type}
Current headline: ${input.block.headline}
Current body: ${input.block.body}

Edit request: "${input.message}"

Language: ${input.locale}. Return the updated object with headline and body.`;
}
