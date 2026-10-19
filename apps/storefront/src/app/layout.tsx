import type { Metadata } from "next";
import Link from "next/link";
import { getCompanySettings, getCurrentYear } from "@/lib/data";
import { brandAsset } from "@/lib/brand";
import { SITE_URL } from "@/lib/constants";
import { organizationLd, storefrontLabel } from "@/lib/jsonld";
import { JsonLd } from "@/components/JsonLd/JsonLd";
import "./globals.scss";

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanySettings();
  const name = storefrontLabel(company);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: name, template: `%s — ${name}` },
    description: `Official ${name} store.`,
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
          <p>
            {company?.legalName} {company?.yTunnus && `· Y-tunnus ${company.yTunnus}`}
            {company?.euVatId && ` · VAT ${company.euVatId}`}
          </p>
          <p>{company?.address}</p>
          <nav>
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal/terms">Terms</Link>
            <Link href="/legal/withdrawal">Right of withdrawal</Link>
          </nav>
        </footer>
      </body>
    </html>
  );
}
