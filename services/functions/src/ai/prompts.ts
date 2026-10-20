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

const HERITAGE_PHASE_GUIDE: Record<string, string> = {
  hook: "Open by confronting the throwaway culture of modern products — things made to be replaced, not kept.",
  reframe: "Reframe ownership as stewardship: a well-made object gains meaning and value as it passes between hands.",
  inaction: "Quantify the quiet cost of disposable goods — repeat purchases, lost craftsmanship, objects with no story.",
  spotlight: "Present the Heritage programme: unique serial numbers, named artisans, a 10-year ownership registry, and concierge ownership transfer.",
  outcomes: "Close with the concrete promises: lifetime repairs for normal wear, premium restoration when needed, and Heirloom status for pieces passed to new owners.",
};

export function heritagePrompt(input: {
  brandName: string;
  icps: Icp[];
  insights: MarketInsight[];
  products: Product[];
  locale: string;
}): string {
  return `Write the five Heritage programme sections for "${input.brandName}" in order: hook, reframe, inaction, spotlight, outcomes.

Phase guidance (internal):
${Object.entries(HERITAGE_PHASE_GUIDE)
  .map(([t, g]) => `- ${t}: ${g}`)
  .join("\n")}

The Heritage programme (factual basis — weave into the copy where relevant):
- Every physical product carries a unique serial number, registered to its owner for 10 years.
- Each product credits the artisan who made it and records its bill of materials origin.
- Lifetime repairs for normal wear and tear are included; premium repair services cover what the lifetime warranty doesn't, keeping products in use.
- A concierge transfer service moves ownership to a new owner (arranged by phone or email). Transferred pieces are promoted to Heirloom classification, and the lifetime warranty carries over to the new owner.

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
  page?: string;
}): string {
  const guide =
    input.page === "heritage" ? HERITAGE_PHASE_GUIDE : PHASE_GUIDE;
  return `Rewrite one storefront section of type "${input.blockType}" for "${input.brandName}".

Phase guidance: ${guide[input.blockType] ?? ""}

Target buyers: ${input.icps.map((i) => `${i.name} (${i.painPoints.join("; ")})`).join(", ")}
Market context: ${input.insights.map((i) => i.insight).join(" | ")}
Products: ${input.products.map((p) => `${p.name}: ${p.features.join("; ")}`).join(" | ")}
${input.current ? `Current version (improve on it): ${JSON.stringify(input.current)}` : ""}

Language: ${input.locale}. Return one object with headline and body.`;
}

export function socialPostPrompt(input: {
  brandName: string;
  icps: Icp[];
  insights: MarketInsight[];
  products: { name: string; url: string }[];
  history: { role: string; text: string }[];
  message: string;
  locale: string;
}): string {
  return `You are drafting Bluesky posts for "${input.brandName}" — an atelier brand.
Reply in the chat AND, when the request calls for it, produce a post draft.

Target buyers: ${input.icps.map((i) => `${i.name} (${i.painPoints.join("; ")})`).join(", ")}
Market context: ${input.insights.map((i) => i.insight).join(" | ")}
Products (link these — URLs render as rich cards on Bluesky):
${input.products.map((p) => `- ${p.name}: ${p.url}`).join("\n")}

Bluesky constraints — hard rules:
- 300 grapheme MAX for the post text. Count emojis/accents carefully; stay under.
- Write links as bare full URLs in the text — they auto-become clickable
  facets and the first link renders a preview card. One link per post works best.
- Tone: direct, crafted, confident. No hashtags unless requested, no emoji
  spam, no corporate voice. Bluesky rewards authenticity over polish.
- Hashtags: at most 1–2 if they genuinely help discovery.

Conversation so far:
${input.history.map((h) => `${h.role}: ${h.text}`).join("\n")}

Admin's latest message: "${input.message}"

Return JSON: {"reply": "your chat reply", "draft": {"text": "post text"} or null}
- "draft" is null when the message doesn't call for a new post (questions,
  discussion, tweaks you fold into a reply instead).
- Language for the post: ${input.locale} unless the admin asks otherwise.`;
}

export const SOCIAL_POST_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    draft: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
  required: ["reply"],
};

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
