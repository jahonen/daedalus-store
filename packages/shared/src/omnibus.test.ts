import { describe, expect, it } from "vitest";
import { effectivePriceCents, referencePriceCents } from "./omnibus.js";
import type { PriceHistoryEntry } from "./schemas.js";

const now = new Date("2026-10-17T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();
const entry = (priceCents: number, days: number): PriceHistoryEntry => ({
  productId: "p1",
  priceCents,
  effectiveAt: daysAgo(days),
});

describe("referencePriceCents (EU Omnibus)", () => {
  it("returns the minimum price within the trailing 30 days", () => {
    const history = [entry(10000, 5), entry(8000, 12), entry(12000, 2)];
    expect(referencePriceCents(history, now)).toBe(8000);
  });

  it("ignores prices older than 30 days", () => {
    const history = [entry(5000, 45), entry(9000, 10)];
    expect(referencePriceCents(history, now)).toBe(9000);
  });

  it("ignores future-dated entries", () => {
    const history = [entry(1000, -3), entry(9000, 10)];
    expect(referencePriceCents(history, now)).toBe(9000);
  });

  it("returns null when the window is empty", () => {
    expect(referencePriceCents([entry(5000, 60)], now)).toBeNull();
    expect(referencePriceCents([], now)).toBeNull();
  });
});

describe("effectivePriceCents", () => {
  it("prefers the sale price", () => {
    expect(effectivePriceCents(10000, 7999)).toBe(7999);
  });
  it("falls back to base", () => {
    expect(effectivePriceCents(10000, null)).toBe(10000);
  });
});
