import type { MetadataRoute } from "next";
import { listActiveProducts } from "@/lib/data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://daedalus-store.web.app";
  const products = await listActiveProducts();
  return [
    { url: site, changeFrequency: "daily", priority: 1 },
    ...products.map((p) => ({
      url: `${site}/products/${p.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
