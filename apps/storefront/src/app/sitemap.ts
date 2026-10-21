import type { MetadataRoute } from "next";
import { getCompanySettings, listActiveProducts } from "@/lib/data";
import { canonicalSiteUrl } from "@/lib/constants";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, company] = await Promise.all([
    listActiveProducts(),
    getCompanySettings(),
  ]);
  const site = canonicalSiteUrl(company);
  return [
    { url: site, changeFrequency: "daily", priority: 1 },
    ...products.map((p) => ({
      url: `${site}/products/${p.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    { url: `${site}/heritage`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${site}/legal/privacy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${site}/legal/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${site}/legal/withdrawal`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
