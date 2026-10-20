import type { Metadata } from "next";
import { getCompanySettings, getMediaAssets, getPublishedPage } from "@/lib/data";
import { storefrontLabel } from "@/lib/jsonld";
import { BlockRenderer } from "@/components/BlockRenderer/BlockRenderer";

export async function generateMetadata(): Promise<Metadata> {
  const [page, company] = await Promise.all([
    getPublishedPage("heritage"),
    getCompanySettings(),
  ]);
  const name = storefrontLabel(company);
  const title = page?.seo?.title ?? page?.title ?? `Heritage — ${name}`;
  const description =
    page?.seo?.description ??
    `Every ${name} product carries a unique serial number, a named artisan, and a lifetime of repair services. Discover the Heritage programme.`;
  return {
    title,
    description,
    alternates: { canonical: "/heritage" },
    openGraph: {
      url: "/heritage",
      title,
      description,
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

/** CMS-editable Heritage page — content lives in storefrontPages/heritage,
 *  editable via the admin Canvas like the homepage. */
export default async function HeritagePage() {
  const page = await getPublishedPage("heritage");

  const mediaIds = page?.blocks.flatMap((b) => b.mediaAssetIds) ?? [];
  const assets = mediaIds.length ? await getMediaAssets([...new Set(mediaIds)]) : [];
  const mediaMap = new Map(assets.map((a) => [a.id, a] as const));

  if (!page) {
    return (
      <article>
        <section className="block">
          <div className="block-inner">
            <h1 className="block-headline">Heritage</h1>
            <p className="block-body">
              Every product we make carries a unique serial number, registered
              to its owner for ten years. Should you wish to pass it on, our
              concierge service transfers ownership — and the piece becomes an
              Heirloom, carrying its story forward. Lifetime repairs for normal
              wear are always included; premium restoration services keep every
              piece in use for generations.
            </p>
          </div>
        </section>
      </article>
    );
  }

  return (
    <article>
      <BlockRenderer blocks={page.blocks} media={mediaMap} />
    </article>
  );
}
