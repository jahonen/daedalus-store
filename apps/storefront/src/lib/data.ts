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
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** During build with Firestore disabled, use a 1s TTL so the first real
 *  request triggers a fresh fetch instead of serving the build-time
 *  content for the full TTL. Zero would make the route fully dynamic,
 *  breaking prerendering in Next.js 16. */
const SKIP_FS = process.env.NEXT_PRIVATE_SKIP_FIRESTORE === "1";

/**
 * Build-time Firestore snapshot exported by a Cloud Build step
 * (infra/scripts/export-storefront-snapshot.mjs) into the image. During
 * prerender the "use cache" scopes below serve this real data instead of
 * null/empty fallbacks, so baked-in shells show the live catalogue and a
 * cold-start stale serve is harmless.
 */
type Snapshot = {
  collections: Record<string, Record<string, Record<string, unknown>>>;
  settings: Record<string, Record<string, unknown> | null>;
};
const EMPTY_SNAPSHOT: Snapshot = { collections: {}, settings: {} };
function loadSnapshot(): Snapshot {
  try {
    const s = JSON.parse(
      readFileSync(join(process.cwd(), "build-snapshot.json"), "utf8"),
    ) as Snapshot;
    console.log("[data] build snapshot loaded:", Object.keys(s.collections));
    return s;
  } catch (e) {
    console.log("[data] build snapshot missing:", e, "cwd:", process.cwd());
    return EMPTY_SNAPSHOT;
  }
}
const SNAPSHOT: Snapshot = SKIP_FS ? loadSnapshot() : EMPTY_SNAPSHOT;
const snapDocs = (coll: string) => Object.entries(SNAPSHOT.collections[coll] ?? {});

/**
 * Build-time resilience: callers branch on SKIP_FS and hand `safe` either a
 * resolved snapshot promise (build) or a Firestore read (runtime). A transient
 * failure shouldn't fail the build — during prerender we swallow and return
 * the fallback; at runtime errors propagate to the error boundary so they
 * don't masquerade as "product not found" for SEO crawlers.
 */
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    console.error("[data] read failed:", e);
    if (SKIP_FS || process.env.NEXT_PHASE === "phase-production-build") {
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
    SKIP_FS
      ? Promise.resolve(
          (() => {
            const raw = SNAPSHOT.collections.storefrontPages?.[slug];
            if (!raw) return null;
            const page = storefrontPageSchema.parse(raw);
            return page.status === "published" ? page : null;
          })(),
        )
      : (async () => {
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
    SKIP_FS
      ? Promise.resolve(
          snapDocs("products")
            .filter(([, d]) => d.slug === slug && d.status === "active")
            .map(([id, d]) => ({ id, ...productSchema.parse(d) }))[0] ?? null,
        )
      : (async () => {
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
    SKIP_FS
      ? Promise.resolve(
          snapDocs("products")
            .filter(([, d]) => d.status === "active")
            .map(([id, d]) => ({ id, ...productSchema.parse(d) })),
        )
      : (async () => {
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
    SKIP_FS
      ? Promise.resolve(
          (() => {
            const now = new Date().toISOString();
            for (const [, d] of snapDocs("campaigns")) {
              if (d.productId !== productId) continue;
              if (d.status !== "scheduled" && d.status !== "active") continue;
              const c = campaignSchema.parse(d);
              if (c.startsAt <= now && c.endsAt > now) return c;
            }
            return null;
          })(),
        )
      : (async () => {
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
    SKIP_FS
      ? Promise.resolve(
          (() => {
            const since = new Date(Date.now() - 31 * 86400_000).toISOString();
            const entries = snapDocs("priceHistory")
              .filter(
                ([, d]) =>
                  d.productId === productId && (d.effectiveAt as string) >= since,
              )
              .map(([, d]) => priceHistoryEntrySchema.parse(d))
              .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt));
            return referencePriceCents(entries);
          })(),
        )
      : (async () => {
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
    SKIP_FS
      ? Promise.resolve(
          SNAPSHOT.settings.company
            ? companySettingsSchema.parse(SNAPSHOT.settings.company)
            : null,
        )
      : (async () => {
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
    SKIP_FS
      ? Promise.resolve(
          ids.flatMap((id) => {
            const raw = SNAPSHOT.collections.media?.[id];
            return raw ? [{ id, ...mediaAssetSchema.parse(raw) }] : [];
          }),
        )
      : (async () => {
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
    SKIP_FS
      ? Promise.resolve(
          (() => {
            const raw = SNAPSHOT.collections.artisans?.[id];
            return raw ? { id, ...artisanSchema.parse(raw) } : null;
          })(),
        )
      : (async () => {
          const snap = await db.collection("artisans").doc(id).get();
          return snap.exists
            ? { id: snap.id, ...artisanSchema.parse(snap.data()) }
            : null;
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


