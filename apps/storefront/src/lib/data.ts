import { cacheLife, cacheTag } from "next/cache";
import {
  campaignSchema,
  companySettingsSchema,
  mediaAssetSchema,
  priceHistoryEntrySchema,
  productSchema,
  referencePriceCents,
  storefrontPageSchema,
} from "@daedalus/shared";
import type {
  Campaign,
  CompanySettings,
  MediaAsset,
  Product,
  StorefrontPage,
} from "@daedalus/shared";
import { db } from "./admin";

/**
 * Build-time resilience: a transient Firestore failure shouldn't fail the build.
 * NEXT_PRIVATE_SKIP_FIRESTORE (set in the Docker build stage) short-circuits
 * reads entirely — without it, environments lacking ADC stall the gRPC
 * metadata-server probe past the prerender cache budget.
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
    return fallback;
  }
}

export async function getPublishedPage(slug: string): Promise<StorefrontPage | null> {
  "use cache";
  cacheTag("pages");
  cacheLife({ revalidate: 60 });
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
  cacheLife({ revalidate: 60 });
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
  cacheLife({ revalidate: 60 });
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
  cacheLife({ revalidate: 60 });
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
  cacheLife({ revalidate: 300 });
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
  cacheLife({ revalidate: 3600 });
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
  cacheLife({ revalidate: 300 });
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

export const CHECKOUT_URL =
  process.env.NEXT_PUBLIC_CHECKOUT_URL ??
  "https://europe-north1-daedalus-store.cloudfunctions.net/createCheckoutSession";
