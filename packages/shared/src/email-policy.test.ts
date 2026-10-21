import { describe, expect, it } from "vitest";
import {
  canConfirmNewsletter,
  checkoutPaymentConfirmed,
  classifyEmailFailure,
  marketingEligibility,
  emailScheduleIso,
} from "./email-policy.js";

describe("mail delivery safety policies", () => {
  it("preserves a valid local schedule as a UTC instant", () =>
    expect(new Date(emailScheduleIso("2026-01-15T10:30")).getHours()).toBe(10));
  it.each(["invalid", "2026-02-30T10:30", "2026-01-15T25:00"])(
    "rejects invalid local schedules %s",
    (value) => expect(() => emailScheduleIso(value)).toThrow(),
  );
  it.each([429, 500, 503])("retries explicit transient provider status %s", (code) =>
    expect(classifyEmailFailure(code)).toBe("queued"),
  );
  it.each([400, 401, 403])("fails permanent provider status %s", (code) =>
    expect(classifyEmailFailure(code)).toBe("failed"),
  );
  it.each([undefined, "ETIMEDOUT", "ECONNRESET"])(
    "does not blindly retry ambiguous transport result %s",
    (code) => expect(classifyEmailFailure(code)).toBe("ambiguous"),
  );
  it("does not treat checkout completion alone as a paid order", () => {
    expect(checkoutPaymentConfirmed("unpaid")).toBe(false);
    expect(checkoutPaymentConfirmed("paid")).toBe(true);
  });
  it("applies withdrawal and cancellation even after audience preparation", () => {
    expect(
      marketingEligibility({
        paused: false,
        status: "unsubscribed",
        suppressed: false,
        cancelled: false,
      }),
    ).toBe("suppressed");
    expect(
      marketingEligibility({
        paused: false,
        status: "confirmed",
        suppressed: false,
        cancelled: true,
      }),
    ).toBe("suppressed");
    expect(
      marketingEligibility({
        paused: true,
        status: "confirmed",
        suppressed: false,
        cancelled: false,
      }),
    ).toBe("paused");
  });
  const valid = {
    purpose: "confirm",
    consumed: false,
    expired: false,
    generation: "new",
    currentGeneration: "new",
    status: "pending",
    suppressed: false,
  };
  it("accepts a current unconsumed confirmation", () =>
    expect(canConfirmNewsletter(valid)).toBe(true));
  it.each([
    { consumed: true },
    { expired: true },
    { currentGeneration: "withdrawn" },
    { status: "unsubscribed" },
    { suppressed: true },
    { purpose: "preferences" },
  ])("rejects stale or invalid confirmation %j", (patch) =>
    expect(canConfirmNewsletter({ ...valid, ...patch })).toBe(false),
  );
});
