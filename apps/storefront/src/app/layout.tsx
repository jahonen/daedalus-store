import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Suspense } from "react";
import { getCompanySettings, getCurrentYear } from "@/lib/data";
import { brandAsset } from "@/lib/brand";
import { GTM_ID, SITE_URL } from "@/lib/constants";
import { organizationLd, storefrontLabel } from "@/lib/jsonld";
import { JsonLd } from "@/components/JsonLd/JsonLd";
import { SiteNav } from "@/components/SiteNav/SiteNav";
import {
  CookieConsent,
  CookiePreferencesButton,
} from "@/components/CookieConsent/CookieConsent";
import "./globals.scss";

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanySettings();
  const name = storefrontLabel(company);
  const description = `Official ${name} store.`;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: name, template: `%s — ${name}` },
    description,
    applicationName: name,
    openGraph: {
      type: "website",
      siteName: name,
      locale: company?.defaultLocale ?? "en",
      url: SITE_URL,
      title: name,
      description,
      images: [
        {
          url: brandAsset("icon-512.png"),
          width: 512,
          height: 512,
          alt: name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
    },
    icons: {
      icon: [
        { url: brandAsset("favicon-16.png"), sizes: "16x16", type: "image/png" },
        { url: brandAsset("favicon-32.png"), sizes: "32x32", type: "image/png" },
        { url: brandAsset("favicon-48.png"), sizes: "48x48", type: "image/png" },
      ],
      apple: [{ url: brandAsset("apple-touch-icon.png"), sizes: "180x180" }],
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [company, year] = await Promise.all([
    getCompanySettings(),
    getCurrentYear(),
  ]);
  const name = storefrontLabel(company);
  return (
    <html lang={company?.defaultLocale ?? "en"}>
      {/*
        Google Tag Manager with Consent Mode v2 defaults: all storage denied
        until CookieConsent pushes a `consent update` to the dataLayer.
        `beforeInteractive` hoists this into <head> as high as Next allows.
      */}
      <Script id="gtm-consent-default" strategy="beforeInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
gtag('consent', 'default', {
  'analytics_storage': 'denied',
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'wait_for_update': 500
});`}
      </Script>
      <Script id="gtm" strategy="beforeInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
      </Script>
      <body>
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
            title="Google Tag Manager"
          />
        </noscript>
        <JsonLd data={organizationLd(company)} />
        <header className="site-header">
          <Link className="brand" href="/">
            <img className="brand-logo" src={brandAsset("logo.png")} alt="" />
            {name}
          </Link>
          <Suspense fallback={null}>
            <SiteNav />
          </Suspense>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <p>
            {company?.storefrontName ? (
              <>
                {company.storefrontName}™ is a trademark of{" "}
                {company.legalName}. All rights reserved.
              </>
            ) : (
              <>{company?.legalName}. All rights reserved.</>
            )}{" "}
            © {year}
          </p>
          <details className="legal-details">
            <summary>Legal &amp; company details</summary>
            <div className="legal-body">
              <p>
                {company?.legalName}
                {company?.yTunnus && ` · Y-tunnus ${company.yTunnus}`}
                {company?.euVatId && ` · VAT ${company.euVatId}`}
              </p>
              <p>{company?.address}</p>
              <nav>
                <Link href="/heritage">Heritage</Link>
                <Link href="/legal/privacy">Privacy</Link>
                <Link href="/legal/terms">Terms</Link>
                <Link href="/legal/withdrawal">Right of withdrawal</Link>
                <CookiePreferencesButton />
              </nav>
            </div>
          </details>
        </footer>
        {company?.gaMeasurementId && (
          <CookieConsent />
        )}
      </body>
    </html>
  );
}
