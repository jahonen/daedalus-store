import type { Metadata } from "next";
import Link from "next/link";
import {
  getCompanySettings,
  getMediaAssets,
  getPublishedPage,
  listActiveProducts,
} from "@/lib/data";
import { storefrontLabel } from "@/lib/jsonld";
import { formatEur } from "@daedalus/shared";
import { BlockRenderer } from "@/components/BlockRenderer/BlockRenderer";

export async function generateMetadata(): Promise<Metadata> {
  const [page, company] = await Promise.all([
    getPublishedPage("home"),
    getCompanySettings(),
  ]);
  return {
    title: page?.seo?.title ?? page?.title ?? storefrontLabel(company),
    description: page?.seo?.description,
    openGraph: page?.ogImageUrl ? { images: [page.ogImageUrl] } : undefined,
  };
}

export default async function HomePage() {
  const [page, products] = await Promise.all([
    getPublishedPage("home"),
    listActiveProducts(),
  ]);

  const mediaIds = page?.blocks.flatMap((b) => b.mediaAssetIds) ?? [];
  const assets = mediaIds.length ? await getMediaAssets(mediaIds) : [];
  const mediaMap = new Map(assets.map((a) => [a.id, a] as const));

  return (
    <>
      {page ? (
        <article>
          <BlockRenderer blocks={page.blocks} media={mediaMap} />
        </article>
      ) : (
        <section className="block">
          <div className="block-inner">
            <h1 className="block-headline">Coming soon</h1>
            <p className="block-body">Our store is being prepared.</p>
          </div>
        </section>
      )}

      {products.length > 0 && (
        <section className="block">
          <div className="block-inner">
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {products.map((p) => (
                <li key={p.id} style={{ margin: "1rem 0" }}>
                  <Link href={`/products/${p.slug}`}>
                    {p.name} — {formatEur(p.basePriceCents)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
