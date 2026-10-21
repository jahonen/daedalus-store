import { afterEach, describe, expect, it, vi } from "vitest";
import { getGaClientId, gtagEvent } from "./ga";
afterEach(() => vi.unstubAllGlobals());
describe("analytics consent", () => {
  it("does not reuse an existing analytics cookie after consent is denied", () => {
    const dataLayer: unknown[] = [];
    vi.stubGlobal("window", { localStorage: { getItem: () => "denied" }, dataLayer });
    vi.stubGlobal("document", { cookie: "_ga=GA1.1.123.456" });
    expect(getGaClientId()).toBeUndefined();
    expect(gtagEvent("newsletter_signup_requested")).toBe(false);
    expect(dataLayer).toHaveLength(0);
  });
  it("passes identifiers/events only with explicit permission", () => {
    const dataLayer: unknown[] = [];
    vi.stubGlobal("window", { localStorage: { getItem: () => "granted" }, dataLayer });
    vi.stubGlobal("document", { cookie: "_ga=GA1.1.123.456" });
    expect(getGaClientId()).toBe("123.456");
    expect(gtagEvent("newsletter_signup_requested", { source: "test" })).toBe(true);
    expect(dataLayer).toEqual([
      { event: "newsletter_signup_requested", source: "test" },
    ]);
  });
});
