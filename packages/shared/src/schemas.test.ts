import { describe, expect, it } from "vitest";
import {
  blockTypeSchema,
  orderSchema,
  productSchema,
  storefrontBlockSchema,
  storefrontPageSchema,
} from "./schemas.js";

describe("storefront block schema", () => {
  it("accepts all five Challenger phases", () => {
    for (const t of ["hook", "reframe", "inaction", "spotlight", "outcomes"]) {
      expect(blockTypeSchema.parse(t)).toBe(t);
    }
  });

  it("rejects unknown block types", () => {
    expect(() => blockTypeSchema.parse("hero")).toThrow();
  });

  it("defaults manuallyEdited/version", () => {
    const b = storefrontBlockSchema.parse({
      id: "b1",
      type: "hook",
      headline: "H",
      body: "B",
    });
    expect(b.manuallyEdited).toBe(false);
    expect(b.version).toBe(1);
    expect(b.mediaAssetIds).toEqual([]);
  });
});

describe("storefront page schema", () => {
  it("round-trips a generated page", () => {
    const page = storefrontPageSchema.parse({
      slug: "home",
      title: "Home",
      blocks: [
        { id: "b1", type: "hook", headline: "H", body: "B" },
        { id: "b2", type: "reframe", headline: "H", body: "B" },
        { id: "b3", type: "inaction", headline: "H", body: "B" },
        { id: "b4", type: "spotlight", headline: "H", body: "B" },
        { id: "b5", type: "outcomes", headline: "H", body: "B" },
      ],
    });
    expect(page.blocks).toHaveLength(5);
    expect(page.status).toBe("draft");
  });
});

describe("product schema", () => {
  it("defaults reservedQuantity, vatRate, currency", () => {
    const p = productSchema.parse({
      name: "Brewer",
      slug: "brewer",
      sku: "NB-001",
      stockQuantity: 10,
      basePriceCents: 24900,
    });
    expect(p.reservedQuantity).toBe(0);
    expect(p.vatRate).toBe(0.24);
    expect(p.currency).toBe("EUR");
    expect(p.status).toBe("draft");
  });
});

describe("order schema", () => {
  it("validates a paid order shape", () => {
    const o = orderSchema.parse({
      stripeSessionId: "cs_test_123",
      items: [
        {
          productId: "p1",
          name: "Brewer",
          qty: 1,
          unitPriceCents: 24900,
          vatRate: 0.24,
        },
      ],
      amounts: {
        subtotalCents: 24900,
        vatCents: 4819,
        totalCents: 24900,
        currency: "EUR",
      },
      customer: { email: "buyer@example.com" },
      status: "PENDING_FULFILLMENT",
    });
    expect(o.status).toBe("PENDING_FULFILLMENT");
  });
});
