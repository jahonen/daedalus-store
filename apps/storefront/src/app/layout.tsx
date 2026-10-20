import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCompanySettings, getCurrentYear } from "@/lib/data";
import { brandAsset } from "@/lib/brand";
import { SITE_URL } from "@/lib/constants";
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
      <body>
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
          <CookieConsent measurementId={company.gaMeasurementId} />
        )}
      </body>
    </html>
  );
}
