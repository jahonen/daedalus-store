import type { CompanySettings } from "./schemas.js";

export function formatCompanyAddress(
  company: Pick<CompanySettings, "address" | "postalAddress">,
): string {
  const address = company.postalAddress;
  if (!address || !Object.values(address).some((value) => value.trim())) return company.address;
  return [
    address.streetAddress,
    [address.postalCode, address.addressLocality].filter(Boolean).join(" "),
    address.addressRegion,
    address.addressCountry,
  ]
    .filter(Boolean)
    .join(", ");
}

export function companyPostalAddress(company: Pick<CompanySettings, "address" | "postalAddress">) {
  const fields = Object.entries(company.postalAddress ?? {}).filter(([, value]) => value.trim());
  return fields.length ? { "@type": "PostalAddress", ...Object.fromEntries(fields) } : undefined;
}
