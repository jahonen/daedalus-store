import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedPage, listActiveProducts } from "@/lib/data";
import { formatEur } from "@daedalus/shared";
import { BlockRenderer } from "@/components/BlockRenderer/BlockRenderer";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublishedPage("home");
  return {
    title: page?.seo?.title ?? page?.title ?? "Store",
    description: page?.seo?.description,
    openGraph: page?.ogImageUrl ? { images: [page.ogImageUrl] } : undefined,
  };
}

export default async function HomePage() {
  const [page, products] = await Promise.all([
    getPublishedPage("home"),
    listActiveProducts(),
  ]);

  return (
    <>
      {page ? (
        <article>
          <BlockRenderer blocks={page.blocks} />
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
