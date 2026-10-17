import type { CompanySettings, MediaAsset, Product } from "@daedalus/shared";

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://storefront-229074810509.europe-north1.run.app";

/** Public trademark falls back to the legal entity when unset. */
export const storefrontLabel = (company: CompanySettings | null): string =>
  company?.storefrontName || company?.legalName || "DAEDALUS Store";

export function organizationLd(company: CompanySettings | null) {
  const name = storefrontLabel(company);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url: SITE,
    ...(company && {
      legalName: company.legalName,
      // Rich results: keep the trademark resolvable separately from the entity.
      ...(company.storefrontName &&
        company.storefrontName !== company.legalName && {
          alternateName: company.legalName,
          brand: { "@type": "Brand", name: company.storefrontName },
        }),
      address: company.address,
      email: company.contactEmail,
      vatID: company.euVatId,
      identifier: company.yTunnus,
    }),
  };
}

export function productLd(
  product: Product,
  media: MediaAsset[],
  priceCents: number,
  inStock: boolean,
  brand?: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    ...(brand && { brand: { "@type": "Brand", name: brand } }),
    description: product.description,
    image: media.map((m) => m.publicUrl),
    offers: {
      "@type": "Offer",
      url: `${SITE}/products/${product.slug}`,
      priceCurrency: "EUR",
      price: (priceCents / 100).toFixed(2),
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      priceValidUntil: new Date(Date.now() + 30 * 86400_000)
        .toISOString()
        .slice(0, 10),
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "FI",
        returnPolicyCategory:
          "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 14,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/ReturnShippingFees",
      },
    },
  };
}
