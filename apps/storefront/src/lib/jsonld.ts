import type { Artisan, CompanySettings, MediaAsset, Product } from "@daedalus/shared";
import { companyPostalAddress } from "@daedalus/shared";
import { SITE_URL as SITE, canonicalSiteUrl } from "./constants";
import { brandAsset } from "./brand";

/** Public trademark falls back to the legal entity when unset. */
export const storefrontLabel = (company: CompanySettings | null): string =>
  company?.storefrontName || company?.legalName || "DAEDALUS Store";

export function organizationLd(company: CompanySettings | null) {
  const name = storefrontLabel(company);
  const site = canonicalSiteUrl(company);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${site}/#organization`,
    name,
    url: site,
    logo: brandAsset("icon-512.png"),
    ...(company && {
      legalName: company.legalName,
      // Rich results: keep the trademark resolvable separately from the entity.
      ...(company.storefrontName &&
        company.storefrontName !== company.legalName && {
          alternateName: company.legalName,
          brand: { "@type": "Brand", name: company.storefrontName },
        }),
      ...(companyPostalAddress(company) && { address: companyPostalAddress(company) }),
      email: company.contactEmail,
      vatID: company.euVatId,
      identifier: company.yTunnus,
    }),
  };
}

export function breadcrumbLd(
  items: { label: string; href?: string }[],
  site = SITE,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      ...(c.href && { item: `${site}${c.href}` }),
    })),
  };
}

export function productLd(
  product: Product,
  media: MediaAsset[],
  priceCents: number,
  inStock: boolean,
  brand?: string,
  artisan?: Artisan | null,
  returnPolicyCountries: string[] = [],
  site = SITE,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    ...(brand && { brand: { "@type": "Brand", name: brand } }),
    ...(artisan && {
      manufacturer: {
        "@type": "Organization",
        name: artisan.name,
        ...(artisan.location && {
          location: { "@type": "Place", name: artisan.location },
        }),
      },
    }),
    ...(product.materials.length > 0 && {
      material: product.materials.map((m) => m.material),
    }),
    description: product.description,
    image: media.map((m) => m.publicUrl),
    offers: {
      "@type": "Offer",
      url: `${site}/products/${product.slug}`,
      priceCurrency: "EUR",
      price: (priceCents / 100).toFixed(2),
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      ...(returnPolicyCountries.length > 0 && {
        hasMerchantReturnPolicy: {
          "@type": "MerchantReturnPolicy",
          applicableCountry: returnPolicyCountries,
          returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
          merchantReturnDays: 14,
          returnMethod: "https://schema.org/ReturnByMail",
          returnFees: "https://schema.org/ReturnShippingFees",
        },
      }),
    },
  };
}
