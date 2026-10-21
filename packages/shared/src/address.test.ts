import { describe, expect, it } from "vitest";
import { companyPostalAddress, formatCompanyAddress } from "./address.js";

describe("company addresses", () => {
  it("preserves legacy display without inventing structured fields", () => {
    const company = { address: "Legacy address" };
    expect(formatCompanyAddress(company)).toBe("Legacy address");
    expect(companyPostalAddress(company)).toBeUndefined();
  });
  it("emits explicitly supplied postal fields", () => {
    const company = {
      address: "Legacy",
      postalAddress: {
        streetAddress: "Example 1",
        postalCode: "00100",
        addressLocality: "Helsinki",
        addressRegion: "",
        addressCountry: "FI",
      },
    };
    expect(formatCompanyAddress(company)).toBe("Example 1, 00100 Helsinki, FI");
    expect(companyPostalAddress(company)).toEqual({
      "@type": "PostalAddress",
      streetAddress: "Example 1",
      postalCode: "00100",
      addressLocality: "Helsinki",
      addressCountry: "FI",
    });
  });
  it("omits empty structured fields", () => {
    expect(
      companyPostalAddress({
        address: "",
        postalAddress: {
          streetAddress: "",
          postalCode: "",
          addressLocality: "",
          addressRegion: "",
          addressCountry: "",
        },
      }),
    ).toBeUndefined();
  });
});
