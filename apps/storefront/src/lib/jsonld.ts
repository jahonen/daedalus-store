import type { CompanySettings, MediaAsset, Product } from "@daedalus/shared";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://daedalus-store.web.app";

export function organizationLd(company: CompanySettings | null) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: company?.legalName ?? "DAEDALUS Store",
    url: SITE,
    ...(company && {
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
) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
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
