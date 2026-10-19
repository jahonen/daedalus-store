import type { Metadata } from "next";
import {
  getActiveCampaign,
  getCompanySettings,
  getMediaAssets,
  getPublishedPage,
  listActiveProducts,
} from "@/lib/data";
import { storefrontLabel } from "@/lib/jsonld";
import { BlockRenderer } from "@/components/BlockRenderer/BlockRenderer";
import { ProductCarousel } from "@/components/ProductCarousel/ProductCarousel";

export async function generateMetadata(): Promise<Metadata> {
  const [page, company] = await Promise.all([
    getPublishedPage("home"),
    getCompanySettings(),
  ]);
  const name = storefrontLabel(company);
  const title = page?.seo?.title ?? page?.title ?? name;
  return {
    title,
    description: page?.seo?.description ?? `Official ${name} store.`,
    alternates: { canonical: "/" },
    openGraph: {
      url: "/",
      ...(page?.ogImageUrl && {
        images: [
          {
            url: page.ogImageUrl,
            width: 1200,
            height: 630,
            alt: title,
            type: "image/png",
          },
        ],
      }),
    },
  };
}

export default async function HomePage() {
  const [page, products] = await Promise.all([
    getPublishedPage("home"),
    listActiveProducts(),
  ]);

  const mediaIds = page?.blocks.flatMap((b) => b.mediaAssetIds) ?? [];
  const productMediaIds = products.flatMap((p) => p.mediaAssetIds.slice(0, 1));
  const assets =
    mediaIds.length || productMediaIds.length
      ? await getMediaAssets([...new Set([...mediaIds, ...productMediaIds])])
      : [];
  const mediaMap = new Map(assets.map((a) => [a.id, a] as const));

  const campaigns = await Promise.all(
    products.map((p) => getActiveCampaign(p.id)),
  );
  const carouselProducts = products.map((p, i) => {
    const first = p.mediaAssetIds[0] ? mediaMap.get(p.mediaAssetIds[0]) : null;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      priceCents: p.basePriceCents,
      salePriceCents: campaigns[i]?.salePriceCents ?? null,
      imageUrl: first?.publicUrl ?? null,
      imageAlt: first?.altText ?? p.name,
    };
  });

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

      {carouselProducts.length > 0 && (
        <ProductCarousel products={carouselProducts} />
      )}
    </>
  );
}
