import { describe, expect, it } from "vitest";
import { csvCell, parseCsv } from "./csv.js";
describe("subscriber CSV", () => {
  it("parses quoted evidence, escaped quotes and newlines", () =>
    expect(parseCsv('email,evidence\r\na@example.com,"Signed, \"\"yes\"\"\nrecord"')).toEqual([
      ["email", "evidence"],
      ["a@example.com", 'Signed, "yes"\nrecord'],
    ]));
  it("rejects malformed quoting", () => expect(() => parseCsv('email,"unclosed')).toThrow());
  it("neutralizes spreadsheet formulas including leading spaces", () => {
    expect(csvCell(" =HYPERLINK(1)")).toBe('"\' =HYPERLINK(1)"');
    expect(csvCell('hello "reader"')).toBe('"hello ""reader"""');
  });
});
