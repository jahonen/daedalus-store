import type { CompanySettings } from "@daedalus/shared";

/** Canonical storefront origin — used in JSON-LD, robots, sitemap, OG, metadata. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://storefront-229074810509.europe-north1.run.app";

/** Site Settings controls the public canonical origin; strip configured
 * trailing slashes before joining paths. */
export const canonicalSiteUrl = (
  company?: Pick<CompanySettings, "siteUrl"> | null,
) => (company?.siteUrl || SITE_URL).replace(/\/+$/, "");

/** Google Tag Manager container — GA4 and any future tags live inside it. */
export const GTM_ID = "GTM-5C5DLBQN";
