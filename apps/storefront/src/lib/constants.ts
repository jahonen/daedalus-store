/** Canonical storefront origin — used in JSON-LD, robots, sitemap, OG, metadata. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://storefront-229074810509.europe-north1.run.app";

/** Google Tag Manager container — GA4 and any future tags live inside it. */
export const GTM_ID = "GTM-5C5DLBQN";
