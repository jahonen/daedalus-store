import { describe, expect, it } from "vitest";
import { formatEur, netCents, vatCents } from "./money.js";

describe("money", () => {
  it("computes VAT portion of a gross price", () => {
    // 124.00 EUR gross at 24% → 24.00 EUR VAT
    expect(vatCents(12400, 0.24)).toBe(2400);
    expect(netCents(12400, 0.24)).toBe(10000);
  });

  it("handles zero VAT", () => {
    expect(vatCents(1000, 0)).toBe(0);
    expect(netCents(1000, 0)).toBe(1000);
  });

  it("formats cents as EUR", () => {
    const s = formatEur(12400, "en-IE");
    expect(s).toContain("124");
  });
});
