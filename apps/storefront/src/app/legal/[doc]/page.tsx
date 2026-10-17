import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompanySettings } from "@/lib/data";

const TITLES: Record<string, string> = {
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  withdrawal: "Right of Withdrawal",
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
  return { title: TITLES[doc] ?? "Legal" };
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
        <h1 className="block-headline">{title}</h1>

        {doc === "privacy" && (
          <div className="block-body">
            <p>
              {name} ({company?.address}) processes personal data only to fulfil
              orders and operate this store. All data is stored within the EEA
              (Google Cloud, Finland/EU regions). We use no tracking cookies or
              third-party analytics.
            </p>
            <p>
              Data controller: {name}
              {company?.privacyRep && ` — privacy representative: ${company.privacyRep}`}.
              Contact: {email}. You may request access, rectification, or erasure
              of your data under GDPR.
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
