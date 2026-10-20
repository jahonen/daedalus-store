import { z } from "zod";

// ── Shared primitives ─────────────────────────────────────────────────────────

/** ISO 8601 date-time string (e.g. `2026-01-15T12:00:00.000Z`). */
export const isoDateTimeString = z.string().datetime({ offset: true });

/** URL-safe slug: lowercase alphanum + hyphens, 1–200 chars. */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a URL-safe slug")
  .min(1)
  .max(200);

/** Absolute URL string. */
export const urlString = z.string().url();

/** Non-negative integer cents (EUR). */
export const nonNegativeCents = z.number().int().nonnegative();

/** VAT rate in [0, 1] range (e.g. 0.24 = 24%). */
export const vatRateSchema = z.number().min(0).max(1);

/** Single supported currency. */
export const currencySchema = z.literal("EUR");

/** Default Finnish standard VAT rate. */
export const DEFAULT_VAT_RATE = 0.24;

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
  slug: slugSchema.or(z.literal("home")), // "home" is the root page
  title: z.string(),
  blocks: z.array(storefrontBlockSchema),
  status: z.enum(["draft", "published"]).default("draft"),
  ogImageUrl: urlString.optional(),
  seo: z
    .object({
      title: z.string(),
      description: z.string(),
    })
    .optional(),
  updatedAt: isoDateTimeString.optional(),
});
export type StorefrontPage = z.infer<typeof storefrontPageSchema>;

// ── Artisans ──────────────────────────────────────────────────────────────────

export const artisanSchema = z.object({
  name: z.string(),
  bio: z.string().default(""),
  mediaAssetIds: z.array(z.string()).default([]),
  specialties: z.array(z.string()).default([]),
  location: z.string().default(""),
  status: z.enum(["active", "archived"]).default("active"),
});
export type Artisan = z.infer<typeof artisanSchema>;

// ── Materials (bill of origins) ───────────────────────────────────────────────

export const materialEntrySchema = z.object({
  material: z.string(),
  origin: z.string(),
  supplier: z.string().default(""),
});
export type MaterialEntry = z.infer<typeof materialEntrySchema>;

// ── Products & catalog ────────────────────────────────────────────────────────

export const productSchema = z.object({
  name: z.string(),
  slug: z.string(), // validated at write time; kept loose for reads (legacy data)
  sku: z.string(),
  description: z.string().default(""),
  dims: z
    .object({ w: z.number(), h: z.number(), d: z.number(), weightKg: z.number() })
    .optional(),
  stockQuantity: z.number().int().nonnegative(),
  reservedQuantity: z.number().int().nonnegative().default(0),
  basePriceCents: nonNegativeCents, // VAT-inclusive
  vatRate: vatRateSchema.default(DEFAULT_VAT_RATE),
  currency: currencySchema.default("EUR"),
  features: z.array(z.string()).default([]),
  mediaAssetIds: z.array(z.string()).default([]),
  status: z.enum(["active", "draft", "archived"]).default("draft"),
  artisanId: z.string().optional(),
  materials: z.array(materialEntrySchema).default([]),
});
export type Product = z.infer<typeof productSchema>;

// ── Pricing ───────────────────────────────────────────────────────────────────

export const priceHistoryEntrySchema = z.object({
  productId: z.string(),
  priceCents: nonNegativeCents,
  effectiveAt: isoDateTimeString,
});
export type PriceHistoryEntry = z.infer<typeof priceHistoryEntrySchema>;

export const campaignSchema = z
  .object({
    productId: z.string(),
    salePriceCents: nonNegativeCents,
    startsAt: isoDateTimeString,
    endsAt: isoDateTimeString,
    status: z.enum(["scheduled", "active", "ended"]).default("scheduled"),
  })
  .refine((c) => c.endsAt > c.startsAt, {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });
export type Campaign = z.infer<typeof campaignSchema>;

// ── Inventory & orders ────────────────────────────────────────────────────────

export const inventoryLockSchema = z.object({
  productId: z.string(),
  qty: z.number().int().positive(),
  stripeSessionId: z.string(),
  expiresAt: isoDateTimeString,
});
export type InventoryLock = z.infer<typeof inventoryLockSchema>;

export const orderItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  qty: z.number().int().positive(),
  unitPriceCents: nonNegativeCents,
  vatRate: vatRateSchema,
});
export type OrderItem = z.infer<typeof orderItemSchema>;

export const orderSchema = z.object({
  stripeSessionId: z.string(),
  items: z.array(orderItemSchema),
  amounts: z.object({
    subtotalCents: nonNegativeCents,
    vatCents: nonNegativeCents,
    totalCents: nonNegativeCents,
    currency: currencySchema.default("EUR"),
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
  status: z.enum(["PENDING_FULFILLMENT", "FULFILLED", "CANCELLED", "REFUNDED"]),
  carrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  createdAt: isoDateTimeString.optional(),
  fulfilledAt: isoDateTimeString.optional(),
});
export type Order = z.infer<typeof orderSchema>;

// ── Checkout sessions (written by createCheckoutSession, read by webhook) ─────

export const checkoutSessionSchema = z.object({
  items: z.array(orderItemSchema),
  amounts: orderSchema.shape.amounts,
  status: z.enum(["reserving", "reserved", "consumed", "released"]),
  expiresAt: isoDateTimeString,
  createdAt: isoDateTimeString,
  /** GA4 client_id captured from the buyer's _ga cookie — joins the
   *  server-side purchase hit to the browsing session. */
  gaClientId: z.string().optional(),
});
export type CheckoutSession = z.infer<typeof checkoutSessionSchema>;

// ── Server-side integrations (admin-only doc; never public-read) ─────────────

export const integrationsSettingsSchema = z.object({
  gaApiSecret: z.string().default(""), // GA4 Measurement Protocol secret
  bluesky: z
    .object({
      /** Account handle, e.g. brand.bsky.social or a custom-domain handle. */
      handle: z.string().default(""),
      /** App password (bsky.app → Settings → App Passwords). Never expose publicly. */
      appPassword: z.string().default(""),
      /** PDS service URL — bsky.social for normal accounts; custom for self-hosted PDS. */
      serviceUrl: z.string().default("https://bsky.social"),
    })
    .default({ handle: "", appPassword: "", serviceUrl: "https://bsky.social" }),
  sendgrid: z
    .object({
      /** SendGrid API key — overrides the SENDGRID_API_KEY cloud secret when set. */
      apiKey: z.string().default(""),
      /** Sender address for order emails — falls back to the env default. */
      fromEmail: z.string().default(""),
    })
    .default({ apiKey: "", fromEmail: "" }),
});
export type IntegrationsSettings = z.infer<typeof integrationsSettingsSchema>;

// ── Social posts (Bluesky drafts + publish history) ───────────────────────────

/** Bluesky's post limit — measured in grapheme clusters, not code points. */
export const BLUESKY_MAX_GRAPHEMES = 300;

export const socialPostSchema = z.object({
  text: z.string(),
  status: z.enum(["draft", "posted"]),
  recordUri: z.string().optional(), // at://did/… after publish
  recordCid: z.string().optional(),
  postUrl: z.string().optional(), // https://bsky.app/profile/…/post/…
  postedAt: isoDateTimeString.optional(),
  createdAt: isoDateTimeString,
});
export type SocialPost = z.infer<typeof socialPostSchema>;

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
  gaMeasurementId: z
    .string()
    .regex(/^(G-[A-Z0-9]+)?$/, "Must be a GA4 Measurement ID (G-XXXXXXXXXX)")
    .default(""),
  /** Production storefront URL — feeds social post links, OG cards, feeds. */
  siteUrl: z
    .string()
    .regex(/^(https?:\/\/[^\s]+)?$/, "Must be a full URL (https://…)")
    .default(""),
});
export type CompanySettings = z.infer<typeof companySettingsSchema>;

// ── Media ─────────────────────────────────────────────────────────────────────

export const mediaAssetSchema = z.object({
  storagePath: z.string(),
  publicUrl: urlString,
  kind: z.enum(["uploaded", "generated"]),
  prompt: z.string().optional(),
  altText: z.string().default(""),
  createdAt: isoDateTimeString.optional(),
});
export type MediaAsset = z.infer<typeof mediaAssetSchema>;

// ── Heritage registry ─────────────────────────────────────────────────────────

/** Heritage warranty duration in years. */
export const HERITAGE_WARRANTY_YEARS = 10;

export const ownershipHistoryEntrySchema = z.object({
  ownerName: z.string(),
  transferredAt: isoDateTimeString,
  transferType: z.enum(["purchase", "concierge_transfer"]),
  notes: z.string().default(""),
});
export type OwnershipHistoryEntry = z.infer<typeof ownershipHistoryEntrySchema>;

/** Doc ID = serial number (guarantees uniqueness). */
export const heritageRegistrySchema = z.object({
  serialNumber: z.string(),
  productId: z.string(),
  orderId: z.string(),
  orderItemIndex: z.number().int(),
  ownerName: z.string(),
  ownerEmail: z.string().email(),
  ownerPhone: z.string().default(""),
  classification: z.enum(["registered", "heirloom"]).default("registered"),
  ownershipHistory: z.array(ownershipHistoryEntrySchema).default([]),
  registeredAt: isoDateTimeString,
  warrantyExpiresAt: isoDateTimeString,
});
export type HeritageRegistry = z.infer<typeof heritageRegistrySchema>;

// ── Repair records ────────────────────────────────────────────────────────────

export const repairRecordSchema = z.object({
  heritageId: z.string(),
  serialNumber: z.string(),
  productId: z.string(),
  status: z.enum(["requested", "received", "in_progress", "completed", "returned"]),
  warrantyType: z.enum(["lifetime", "premium"]),
  description: z.string(),
  repairNotes: z.string().default(""),
  partsUsed: z.array(z.string()).default([]),
  technician: z.string().default(""),
  costCents: nonNegativeCents.default(0),
  beforeMediaIds: z.array(z.string()).default([]),
  afterMediaIds: z.array(z.string()).default([]),
  inboundCarrier: z.string().default(""),
  inboundTracking: z.string().default(""),
  outboundCarrier: z.string().default(""),
  outboundTracking: z.string().default(""),
  createdAt: isoDateTimeString,
  completedAt: isoDateTimeString.optional(),
});
export type RepairRecord = z.infer<typeof repairRecordSchema>;
