import { cacheLife, cacheTag } from "next/cache";
import {
  artisanSchema,
  campaignSchema,
  companySettingsSchema,
  mediaAssetSchema,
  priceHistoryEntrySchema,
  productSchema,
  referencePriceCents,
  storefrontPageSchema,
} from "@daedalus/shared";
import type {
  Artisan,
  Campaign,
  CompanySettings,
  MediaAsset,
  Product,
  StorefrontPage,
} from "@daedalus/shared";
import { db } from "./admin";

/** During build with Firestore disabled, use a 1s TTL so the first real
 *  request triggers a fresh fetch instead of serving the build-time
 *  null/empty fallback for the full TTL. Zero would make the route fully
 *  dynamic, breaking prerendering in Next.js 16. */
const SKIP_FS = process.env.NEXT_PRIVATE_SKIP_FIRESTORE === "1";

/**
 * Build-time resilience: a transient Firestore failure shouldn't fail the build.
 * NEXT_PRIVATE_SKIP_FIRESTORE (set in the Docker build stage) short-circuits
 * reads entirely — without it, environments lacking ADC stall the gRPC
 * metadata-server probe past the prerender cache budget.
 *
 * At runtime, transient errors propagate to the error boundary so they don't
 * masquerade as "product not found" for SEO crawlers. The fallback only
 * applies during build/prerender.
 */
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  if (process.env.NEXT_PRIVATE_SKIP_FIRESTORE === "1") {
    p.catch(() => {});
    return fallback;
  }
  try {
    return await p;
  } catch (e) {
    console.error("[data] Firestore read failed:", e);
    // During build/prerender, swallow and return fallback.
    // At runtime, propagate to the error boundary.
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return fallback;
    }
    throw e;
  }
}

export async function getPublishedPage(slug: string): Promise<StorefrontPage | null> {
  "use cache";
  cacheTag("pages");
  cacheLife({ revalidate: SKIP_FS ? 1 : 60 });
  return safe(
    (async () => {
      const snap = await db.collection("storefrontPages").doc(slug).get();
      if (!snap.exists) return null;
      const page = storefrontPageSchema.parse(snap.data());
      return page.status === "published" ? page : null;
    })(),
    null,
  );
}

export async function getProduct(slug: string): Promise<(Product & { id: string }) | null> {
  "use cache";
  cacheTag("products");
  cacheLife({ revalidate: SKIP_FS ? 1 : 60 });
  return safe(
    (async () => {
      const snap = await db
        .collection("products")
        .where("slug", "==", slug)
        .where("status", "==", "active")
        .limit(1)
        .get();
      if (snap.empty) return null;
      const doc = snap.docs[0];
      return { id: doc.id, ...productSchema.parse(doc.data()) };
    })(),
    null,
  );
}

export async function listActiveProducts(): Promise<(Product & { id: string })[]> {
  "use cache";
  cacheTag("products");
  cacheLife({ revalidate: SKIP_FS ? 1 : 60 });
  return safe(
    (async () => {
      const snap = await db
        .collection("products")
        .where("status", "==", "active")
        .get();
      return snap.docs.map((d) => ({ id: d.id, ...productSchema.parse(d.data()) }));
    })(),
    [],
  );
}

export async function getActiveCampaign(productId: string): Promise<Campaign | null> {
  "use cache";
  cacheTag("campaigns");
  cacheLife({ revalidate: SKIP_FS ? 1 : 60 });
  return safe(
    (async () => {
      const now = new Date().toISOString();
      const snap = await db
        .collection("campaigns")
        .where("productId", "==", productId)
        .where("status", "in", ["scheduled", "active"])
        .get();
      for (const d of snap.docs) {
        const c = campaignSchema.parse(d.data());
        if (c.startsAt <= now && c.endsAt > now) return c;
      }
      return null;
    })(),
    null,
  );
}

export async function getOmnibusReferencePrice(productId: string): Promise<number | null> {
  "use cache";
  cacheTag("prices");
  cacheLife({ revalidate: SKIP_FS ? 1 : 300 });
  return safe(
    (async () => {
      const since = new Date(Date.now() - 31 * 86400_000).toISOString();
      const snap = await db
        .collection("priceHistory")
        .where("productId", "==", productId)
        .where("effectiveAt", ">=", since)
        .orderBy("effectiveAt", "desc") // matches deployed composite index
        .get();
      return referencePriceCents(
        snap.docs.map((d) => priceHistoryEntrySchema.parse(d.data())),
      );
    })(),
    null,
  );
}

export async function getCompanySettings(): Promise<CompanySettings | null> {
  "use cache";
  cacheTag("company");
  cacheLife({ revalidate: SKIP_FS ? 1 : 3600 });
  return safe(
    (async () => {
      const snap = await db.collection("settings").doc("company").get();
      return snap.exists ? companySettingsSchema.parse(snap.data()) : null;
    })(),
    null,
  );
}

export async function getMediaAssets(
  ids: string[],
): Promise<(MediaAsset & { id: string })[]> {
  "use cache";
  cacheTag("media");
  cacheLife({ revalidate: SKIP_FS ? 1 : 300 });
  return safe(
    (async () => {
      if (!ids.length) return [];
      const snaps = await db.getAll(
        ...ids.map((id) => db.collection("media").doc(id)),
      );
      return snaps.flatMap((s) =>
        s.exists ? [{ id: s.id, ...mediaAssetSchema.parse(s.data()) }] : [],
      );
    })(),
    [],
  );
}

export async function getArtisan(id: string): Promise<(Artisan & { id: string }) | null> {
  "use cache";
  cacheTag("artisans");
  cacheLife({ revalidate: SKIP_FS ? 1 : 300 });
  return safe(
    (async () => {
      const snap = await db.collection("artisans").doc(id).get();
      return snap.exists ? { id: snap.id, ...artisanSchema.parse(snap.data()) } : null;
    })(),
    null,
  );
}

/**
 * Copyright-year rendering: Cache Components flags bare `new Date()` in
 * prerendered shells, so the year comes through a cached function instead.
 */
export async function getCurrentYear(): Promise<number> {
  "use cache";
  cacheLife({ revalidate: 86400 });
  return new Date().getFullYear();
}


