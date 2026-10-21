import { describe, expect, it } from "vitest";
import { companySettingsSchema, productSchema } from "@daedalus/shared";
import { organizationLd, productLd } from "./jsonld";

const company = companySettingsSchema.parse({
  legalName: "Example Oy",
  storefrontName: "Atelier",
  address: "Legacy address",
  yTunnus: "",
  euVatId: "",
  contactEmail: "hello@example.com",
});
describe("storefront JSON-LD", () => {
  it("does not guess structured fields from a legacy address", () => {
    expect(organizationLd(company)).not.toHaveProperty("address");
    expect(organizationLd(company)).toHaveProperty("@id");
  });
  it("uses the configured canonical site URL", () => {
    const result = organizationLd({
      ...company,
      siteUrl: "https://store.example.com/",
    });
    expect(result["@id"]).toBe("https://store.example.com/#organization");
    expect(result.url).toBe("https://store.example.com");
  });
  it("emits explicit PostalAddress fields", () => {
    const result = organizationLd({
      ...company,
      postalAddress: {
        streetAddress: "Example 1",
        postalCode: "00100",
        addressLocality: "Helsinki",
        addressRegion: "",
        addressCountry: "FI",
      },
    });
    expect(result.address).toMatchObject({
      "@type": "PostalAddress",
      postalCode: "00100",
      addressCountry: "FI",
    });
  });
  it("does not invent an offer expiry or return countries", () => {
    const product = productSchema.parse({
      name: "Bag",
      sku: "BAG",
      slug: "bag",
      description: "A bag",
      basePriceCents: 10000,
      stockQuantity: 1,
      vatRate: 0.255,
    });
    const result = productLd(product, [], 10000, true);
    expect(result.offers).not.toHaveProperty("priceValidUntil");
    expect(result.offers).not.toHaveProperty("hasMerchantReturnPolicy");
    expect(
      productLd(product, [], 10000, true, undefined, null, ["FI", "SE"]).offers
        .hasMerchantReturnPolicy,
    ).toMatchObject({ applicableCountry: ["FI", "SE"] });
  });
});
