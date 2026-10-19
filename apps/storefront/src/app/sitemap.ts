import type { MetadataRoute } from "next";
import { listActiveProducts } from "@/lib/data";
import { SITE_URL } from "@/lib/constants";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await listActiveProducts();
  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    ...products.map((p) => ({
      url: `${SITE_URL}/products/${p.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
