import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  getActiveCampaign,
  getArtisan,
  getCompanySettings,
  getMediaAssets,
  getOmnibusReferencePrice,
  getProduct,
} from "@/lib/data";
import { productLd, storefrontLabel } from "@/lib/jsonld";
import { Breadcrumbs } from "@/components/Breadcrumbs/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd/JsonLd";
import { ProductGallery } from "@/components/ProductGallery/ProductGallery";
import { BillOfOrigins } from "@/components/BillOfOrigins/BillOfOrigins";
import { PriceDisplay } from "@/components/PriceDisplay/PriceDisplay";
import { BuyButton } from "@/components/BuyButton/BuyButton";
import "./product.scss";

// No generateStaticParams: products render on-demand; 'use cache' data
// fetchers provide ISR semantics. (Next 16 Cache Components requires
// non-empty static params, and the catalog lives in Firestore.)

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return {};
  const media = await getMediaAssets(product.mediaAssetIds);
  const canonical = `/products/${slug}`;
  return {
    title: product.name,
    description: product.description,
    alternates: { canonical },
    openGraph: {
      url: canonical,
      title: product.name,
      description: product.description,
      ...(media[0] && {
        images: [
          {
            url: media[0].publicUrl,
            alt: media[0].altText || product.name,
            width: 800,
            height: 800,
          },
        ],
      }),
    },
  };
}

export default function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<div className="product-page" />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

async function ProductContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const [campaign, referencePrice, media, company, artisan] = await Promise.all([
    getActiveCampaign(product.id),
    getOmnibusReferencePrice(product.id),
    getMediaAssets(product.mediaAssetIds),
    getCompanySettings(),
    product.artisanId ? getArtisan(product.artisanId) : Promise.resolve(null),
  ]);

  const available = product.stockQuantity - product.reservedQuantity;
  const priceCents = campaign?.salePriceCents ?? product.basePriceCents;

  return (
    <article className="product-page">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: product.name },
        ]}
      />
      <JsonLd
        data={productLd(
          product,
          media,
          priceCents,
          available > 0,
          company?.storefrontName || undefined,
          artisan,
        )}
      />
      <div className="product-grid">
        <div className="product-media">
          <ProductGallery
            images={media.map((m) => ({
              url: m.publicUrl,
              alt: m.altText || product.name,
            }))}
          />
        </div>
        <div className="product-info">
          <h1>{product.name}</h1>
          {product.description && <p className="product-desc">{product.description}</p>}
          <PriceDisplay
            basePriceCents={product.basePriceCents}
            salePriceCents={campaign?.salePriceCents ?? null}
            saleEndsAt={campaign?.endsAt ?? null}
            referencePriceCents={campaign ? referencePrice : null}
          />
          <BuyButton productId={product.id} soldOut={available <= 0} />
          {product.features.length > 0 && (
            <ul className="product-features">
              {product.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          {product.dims && (
            <p className="product-dims">
              {product.dims.w} × {product.dims.h} × {product.dims.d} cm ·{" "}
              {product.dims.weightKg} kg
            </p>
          )}
          {artisan && (
            <p className="product-artisan">
              Handcrafted by {artisan.name}
              {artisan.location ? ` · ${artisan.location}` : ""}
            </p>
          )}
          <BillOfOrigins materials={product.materials} />
        </div>
      </div>
    </article>
  );
}
