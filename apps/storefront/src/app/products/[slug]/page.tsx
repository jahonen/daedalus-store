import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  getActiveCampaign,
  getCompanySettings,
  getMediaAssets,
  getOmnibusReferencePrice,
  getProduct,
} from "@/lib/data";
import { productLd, storefrontLabel } from "@/lib/jsonld";
import { JsonLd } from "@/components/JsonLd/JsonLd";
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
  return { title: product.name, description: product.description };
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

  const [campaign, referencePrice, media, company] = await Promise.all([
    getActiveCampaign(product.id),
    getOmnibusReferencePrice(product.id),
    getMediaAssets(product.mediaAssetIds),
    getCompanySettings(),
  ]);

  const available = product.stockQuantity - product.reservedQuantity;
  const priceCents = campaign?.salePriceCents ?? product.basePriceCents;

  return (
    <article className="product-page">
      <JsonLd
        data={productLd(
          product,
          media,
          priceCents,
          available > 0,
          company?.storefrontName || undefined,
        )}
      />
      <div className="product-grid">
        <div className="product-media">
          {media[0] ? (
            <Image
              src={media[0].publicUrl}
              alt={media[0].altText || product.name}
              width={800}
              height={800}
              priority
            />
          ) : (
            <div className="product-media-placeholder" aria-hidden />
          )}
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
        </div>
      </div>
    </article>
  );
}
