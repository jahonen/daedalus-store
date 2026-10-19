import type { CompanySettings, MediaAsset, Product } from "@daedalus/shared";
import { SITE_URL as SITE } from "./constants";
import { brandAsset } from "./brand";

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
    logo: brandAsset("icon-512.png"),
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

export function breadcrumbLd(items: { label: string; href?: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      ...(c.href && { item: `${SITE}${c.href}` }),
    })),
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
