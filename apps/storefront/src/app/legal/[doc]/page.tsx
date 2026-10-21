import type { Metadata } from "next";
import { formatCompanyAddress } from "@daedalus/shared";
import { notFound } from "next/navigation";
import { getCompanySettings } from "@/lib/data";
import { storefrontLabel } from "@/lib/jsonld";
import { canonicalSiteUrl } from "@/lib/constants";
import { Breadcrumbs } from "@/components/Breadcrumbs/Breadcrumbs";
import "./legal.scss";

const TITLES: Record<string, string> = {
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  withdrawal: "Right of Withdrawal",
};

const DESCRIPTIONS: Record<string, string> = {
  privacy: "How we collect, use, and protect your personal data under the GDPR.",
  terms: "Terms and conditions governing purchases from our store.",
  withdrawal: "Your EU right to withdraw from a purchase within 14 days.",
};

export function generateStaticParams() {
  return Object.keys(TITLES).map((doc) => ({ doc }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}): Promise<Metadata> {
  const { doc } = await params;
  return {
    title: TITLES[doc] ?? "Legal",
    description: DESCRIPTIONS[doc],
    alternates: { canonical: `/legal/${doc}` },
    openGraph: { url: `/legal/${doc}` },
  };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ doc: string }>;
}) {
  const { doc } = await params;
  const title = TITLES[doc];
  if (!title) notFound();
  const company = await getCompanySettings();
  const name = company?.legalName ?? "the merchant";
  const email = company?.contactEmail ?? "";

  return (
    <article className="block">
      <div className="block-inner" style={{ textAlign: "left" }}>
        <Breadcrumbs
          siteUrl={canonicalSiteUrl(company)}
          items={[{ label: "Home", href: "/" }, { label: title }]}
        />
        <h1 className="block-headline">{title}</h1>

        {doc === "privacy" && (
          <div className="block-body legal-doc">
            <p>
              This privacy statement describes how {storefrontLabel(company)}{" "}
              ({company?.legalName}) processes personal data when you use this
              store, in line with the EU General Data Protection Regulation
              (GDPR).
            </p>

            <h2>1. Data controller</h2>
            <p>
              {name}
              {company?.yTunnus && ` (Y-tunnus ${company.yTunnus})`}
              <br />
              {company ? formatCompanyAddress(company) : ""}
              <br />
              Contact: {email}
              {company?.privacyRep && (
                <>
                  <br />
                  Data protection contact: {company.privacyRep}
                </>
              )}
            </p>

            <h2>2. What we process and why</h2>
            <p>
              <strong>Orders and delivery.</strong> Name, contact details,
              delivery address, and order contents are processed to fulfil your
              purchase and provide customer service. Legal basis: performance of
              a contract (Art. 6(1)(b)) and our legal obligation to retain
              accounting records (Art. 6(1)(c)).
            </p>
            <p>
              <strong>Payments.</strong> Card and payment details are entered
              directly with our payment processor; we receive and store only a
              transaction reference, never card numbers. Legal basis:
              performance of a contract (Art. 6(1)(b)).
            </p>
            <p>
              <strong>Order emails.</strong> Your email address and order
              details are used to send order confirmations, fulfilment and
              shipping notices, and replies to your enquiries. Legal basis:
              performance of a contract and legitimate interest (Art. 6(1)(b),
              (f)).
            </p>
            <p>
              <strong>Newsletter.</strong> With your consent (Art. 6(1)(a)), we
              use your email address to send product news and newsletters after
              you confirm your subscription. Every newsletter includes unsubscribe
              and preference links. Optional, separately permitted image-based
              open measurement provides approximate campaign totals; withdrawing
              measurement permission does not cancel your newsletter. Essential
              service emails do not depend on newsletter consent.
            </p>
            <p>
              <strong>Store analytics.</strong> When you accept analytics, Google
              Analytics uses cookies and browsing events to measure store usage
              and purchases. You can change your choice through Cookies in the
              footer. Legal basis: consent (Art. 6(1)(a)).
            </p>
            <p>
              <strong>AI-assisted content.</strong> Storefront content and
              product imagery may be generated or edited with AI tooling. No
              customer personal data is used for this purpose.
            </p>

            <h2>3. Processors and international transfers</h2>
            <p>We use the following processors, bound by data processing agreements:</p>
            <ul>
              <li>
                <strong>Google Cloud</strong> (Google Ireland Ltd / Google LLC)
                — hosting, database, file storage, and AI services. Store data
                is hosted in European regions (eur3, europe-north1,
                europe-west3). Any access from outside the EEA is covered by EU
                Standard Contractual Clauses.
              </li>
              <li>
                <strong>Stripe</strong> (Stripe Payments Europe Ltd / Stripe
                Inc.) — payment processing. Transfers to the US are covered by
                Standard Contractual Clauses.
              </li>
              <li>
                <strong>SendGrid</strong> (Twilio Inc.) — transactional and
                newsletter email delivery, delivery feedback and optional open measurement. Transfers to the US are covered by Standard
                Contractual Clauses.
              </li>
            </ul>
            <p>
              We do not sell personal data and do not share it with third
              parties for advertising.
            </p>

            <h2>4. Retention</h2>
            <p>
              Order and invoicing records are kept for the period required by
              Finnish accounting and tax law (up to 10 years). Correspondence is
              retained up to 24 months. Aggregated analytics data is retained up
              to 14 months. Pending newsletter signups expire after 30 days;
              email delivery details are retained for up to 90 days, and raw
              delivery/open-measurement feedback for 30 days. Unsubscribing stops
              marketing use immediately. Minimal consent and suppression evidence
              may be retained to respect withdrawals and demonstrate compliance.
              Data is deleted or anonymised when no longer needed.
            </p>

            <h2>5. Your rights</h2>
            <p>
              You may request access to, rectification or erasure of your
              personal data, restriction of or objection to processing, and data
              portability by contacting {email}. You also have the right to
              lodge a complaint with the Finnish Data Protection Ombudsman
              (tietosuoja.fi) or your local supervisory authority.
            </p>

            <h2>6. Cookies</h2>
            <p>
              Strictly necessary technologies support checkout. Optional analytics
              cookies are loaded only after acceptance through the consent banner.
              You can revisit your choice using Cookies in the footer.
            </p>

            <h2>7. Automated decision-making</h2>
            <p>
              We do not make decisions with legal or similarly significant
              effects about you solely by automated means.
            </p>

            <h2>8. Changes</h2>
            <p>
              We may update this statement when our processing changes. The
              current version is always available on this page.
              <br />
              Last updated: October 2026.
            </p>
          </div>
        )}

        {doc === "terms" && (
          <div className="block-body">
            <p>
              These terms govern purchases from {name}
              {company?.yTunnus && ` (Y-tunnus ${company.yTunnus}`}
              {company?.euVatId && `, VAT ${company.euVatId}`}
              {company?.yTunnus ? ")" : ""}. Prices include VAT. Finnish law and
              EU consumer protection rules apply.
            </p>
          </div>
        )}

        {doc === "withdrawal" && (
          <div className="block-body">
            <p>
              Under the EU Consumer Rights Directive, you may withdraw from your
              purchase within 14 days of receiving the goods without giving any
              reason.
            </p>
            <p>
              To withdraw, email {email} with your order reference, or reply to
              your order confirmation. You will receive a pre-filled return
              authorisation. Refunds are issued within 14 days of the goods
              being returned.
            </p>
            <p id="cancel">
              <strong>Cancel an order:</strong> contact {email} quoting your
              Stripe order reference.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
