import type { MetadataRoute } from "next";
import { getCompanySettings } from "@/lib/data";
import { canonicalSiteUrl } from "@/lib/constants";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = canonicalSiteUrl(await getCompanySettings());
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${site}/sitemap.xml`,
  };
}
