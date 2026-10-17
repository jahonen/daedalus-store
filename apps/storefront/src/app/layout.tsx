import type { Metadata } from "next";
import Link from "next/link";
import { getCompanySettings } from "@/lib/data";
import { brandAsset } from "@/lib/brand";
import { organizationLd } from "@/lib/jsonld";
import { JsonLd } from "@/components/JsonLd/JsonLd";
import "./globals.scss";

export const metadata: Metadata = {
  title: { default: "Store", template: "%s — Store" },
  description: "Official store.",
  icons: {
    icon: [
      { url: brandAsset("favicon-16.png"), sizes: "16x16", type: "image/png" },
      { url: brandAsset("favicon-32.png"), sizes: "32x32", type: "image/png" },
      { url: brandAsset("favicon-48.png"), sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: brandAsset("apple-touch-icon.png"), sizes: "180x180" }],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const company = await getCompanySettings();
  return (
    <html lang={company?.defaultLocale ?? "en"}>
      <body>
        <JsonLd data={organizationLd(company)} />
        <header className="site-header">
          <Link className="brand" href="/">
            <img className="brand-logo" src={brandAsset("logo.png")} alt="" />
            {company?.legalName ?? "Store"}
          </Link>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
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
