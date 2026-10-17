import { z } from "zod";

/** Lifecycle tag per project rules. */
export const lifecycleTagSchema = z.enum(["alpha", "beta", "stable", "deprecated"]);
export type LifecycleTag = z.infer<typeof lifecycleTagSchema>;

// ── Storefront blocks (Challenger pipeline output) ────────────────────────────

export const blockTypeSchema = z.enum([
  "hook",      // Phase 1: Status Quo Hook
  "reframe",   // Phase 2: Commercial Reframe
  "inaction",  // Phase 3: Cost of Inaction
  "spotlight", // Phase 4: Product Spotlight
  "outcomes",  // Phase 5: Validated Outcomes
]);
export type BlockType = z.infer<typeof blockTypeSchema>;

export const storefrontBlockSchema = z.object({
  id: z.string(),
  type: blockTypeSchema,
  headline: z.string(),
  body: z.string(),
  mediaAssetIds: z.array(z.string()).default([]),
  manuallyEdited: z.boolean().default(false),
  version: z.number().int().default(1),
});
export type StorefrontBlock = z.infer<typeof storefrontBlockSchema>;

export const storefrontPageSchema = z.object({
  slug: z.string(),
  title: z.string(),
  blocks: z.array(storefrontBlockSchema),
  status: z.enum(["draft", "published"]).default("draft"),
  ogImageUrl: z.string().optional(),
  seo: z
    .object({
      title: z.string(),
      description: z.string(),
    })
    .optional(),
  updatedAt: z.string().optional(),
});
export type StorefrontPage = z.infer<typeof storefrontPageSchema>;

// ── Products & catalog ────────────────────────────────────────────────────────

export const productSchema = z.object({
  name: z.string(),
  slug: z.string(),
  sku: z.string(),
  description: z.string().default(""),
  dims: z
    .object({ w: z.number(), h: z.number(), d: z.number(), weightKg: z.number() })
    .optional(),
  stockQuantity: z.number().int().nonnegative(),
  reservedQuantity: z.number().int().nonnegative().default(0),
  basePriceCents: z.number().int().nonnegative(), // VAT-inclusive
  vatRate: z.number().min(0).max(1).default(0.24), // FI standard VAT
  currency: z.literal("EUR").default("EUR"),
  features: z.array(z.string()).default([]),
  mediaAssetIds: z.array(z.string()).default([]),
  status: z.enum(["active", "draft", "archived"]).default("draft"),
});
export type Product = z.infer<typeof productSchema>;

// ── Pricing ───────────────────────────────────────────────────────────────────

export const priceHistoryEntrySchema = z.object({
  productId: z.string(),
  priceCents: z.number().int().nonnegative(),
  effectiveAt: z.string(), // ISO timestamp
});
export type PriceHistoryEntry = z.infer<typeof priceHistoryEntrySchema>;

export const campaignSchema = z.object({
  productId: z.string(),
  salePriceCents: z.number().int().nonnegative(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(["scheduled", "active", "ended"]).default("scheduled"),
});
export type Campaign = z.infer<typeof campaignSchema>;

// ── Inventory & orders ────────────────────────────────────────────────────────

export const inventoryLockSchema = z.object({
  productId: z.string(),
  qty: z.number().int().positive(),
  stripeSessionId: z.string(),
  expiresAt: z.string(),
});
export type InventoryLock = z.infer<typeof inventoryLockSchema>;

export const orderItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  qty: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  vatRate: z.number(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

export const orderSchema = z.object({
  stripeSessionId: z.string(),
  items: z.array(orderItemSchema),
  amounts: z.object({
    subtotalCents: z.number().int(),
    vatCents: z.number().int(),
    totalCents: z.number().int(),
    currency: z.literal("EUR").default("EUR"),
  }),
  customer: z.object({
    email: z.string().email(),
    name: z.string().optional(),
    address: z
      .object({
        line1: z.string(),
        city: z.string(),
        postalCode: z.string(),
        country: z.string(),
      })
      .optional(),
  }),
  status: z.enum(["PENDING_FULFILLMENT", "FULFILLED", "CANCELLED"]),
  carrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  createdAt: z.string().optional(),
  fulfilledAt: z.string().optional(),
});
export type Order = z.infer<typeof orderSchema>;

// ── Strategy inputs ───────────────────────────────────────────────────────────

export const icpSchema = z.object({
  name: z.string(),
  description: z.string(),
  painPoints: z.array(z.string()).default([]),
  statusQuo: z.string().default(""),
});
export type Icp = z.infer<typeof icpSchema>;

export const marketInsightSchema = z.object({
  insight: z.string(),
  source: z.string().default(""),
  createdAt: z.string().optional(),
});
export type MarketInsight = z.infer<typeof marketInsightSchema>;

// ── Company / legal profile ───────────────────────────────────────────────────

export const companySettingsSchema = z.object({
  legalName: z.string(),
  storefrontName: z.string().default(""), // public trademark
  address: z.string(),
  yTunnus: z.string(), // Finnish Business ID
  euVatId: z.string(),
  contactEmail: z.string().email(),
  privacyRep: z.string().default(""),
  defaultLocale: z.enum(["fi", "en"]).default("en"),
});
export type CompanySettings = z.infer<typeof companySettingsSchema>;

// ── Media ─────────────────────────────────────────────────────────────────────

export const mediaAssetSchema = z.object({
  storagePath: z.string(),
  publicUrl: z.string(),
  kind: z.enum(["uploaded", "generated"]),
  prompt: z.string().optional(),
  altText: z.string().default(""),
  createdAt: z.string().optional(),
});
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
