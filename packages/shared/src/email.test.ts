import { describe, expect, it } from "vitest";
import { companySettingsSchema } from "./schemas.js";
import { emailContentSchema, renderEmail } from "./email.js";

const company = companySettingsSchema.parse({
  legalName: "Atelier",
  address: "Example 1",
  yTunnus: "",
  euVatId: "",
  contactEmail: "hello@example.com",
});
describe("branded email renderer", () => {
  it("escapes content and supplies text alternative", () => {
    const result = renderEmail({
      company,
      content: {
        subject: "Test",
        preheader: "Preview",
        blocks: [{ type: "paragraph", text: '<script>alert("x")</script>' }],
      },
    });
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.text).toContain("Example 1");
  });
  it("keeps branded marketing HTML and text stable", () => {
    expect(
      renderEmail({
        company,
        content: {
          subject: "Atelier news",
          preheader: "A new chapter",
          blocks: [
            { type: "heading", text: "Made to keep" },
            { type: "paragraph", text: "Stories from the atelier." },
            { type: "button", text: "Discover", url: "https://example.com/collection" },
          ],
        },
        unsubscribeUrl: "https://example.com/unsubscribe",
        preferencesUrl: "https://example.com/preferences",
      }),
    ).toMatchInlineSnapshot(`
      {
        "html": "<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f4f6;color:#1c1c1e;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden">A new chapter</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="600" style="width:100%;max-width:600px;background:#fff" cellspacing="0" cellpadding="0"><tr><td style="padding:32px"><h1 style="font-size:20px">Atelier</h1><h2 style="font-size:24px;line-height:1.3">Made to keep</h2><p style="line-height:1.6;white-space:pre-line">Stories from the atelier.</p><p style="padding:16px 0"><a href="https://example.com/collection" style="background:#b3261e;color:#fff;padding:14px 22px;display:inline-block;text-decoration:none;border-radius:4px">Discover</a></p><hr style="border:0;border-top:1px solid #ddd"><div style="font-size:12px;line-height:1.6;color:#555">Atelier · Example 1 · hello@example.com<p>You receive this newsletter because you subscribed. <a href="https://example.com/unsubscribe">Unsubscribe</a> · <a href="https://example.com/preferences">Preferences</a></p></div></td></tr></table></td></tr></table></body></html>",
        "text": "Atelier

      Made to keep

      Stories from the atelier.

      Discover: https://example.com/collection

      Atelier · Example 1 · hello@example.com

      Unsubscribe: https://example.com/unsubscribe

      Preferences: https://example.com/preferences",
      }
    `);
  });
  it("rejects unsafe links and header injection", () => {
    expect(
      emailContentSchema.safeParse({
        subject: "Hi\r\nBcc: bad",
        blocks: [{ type: "paragraph", text: "hello" }],
      }).success,
    ).toBe(false);
    expect(
      emailContentSchema.safeParse({
        subject: "Hi",
        blocks: [{ type: "button", text: "Click", url: "javascript:alert(1)" }],
      }).success,
    ).toBe(false);
  });
  it("does not insert tracking or unsubscribe into service mail", () => {
    const result = renderEmail({
      company,
      content: { subject: "Order", preheader: "", blocks: [{ type: "paragraph", text: "Paid" }] },
    });
    expect(result.html).not.toContain("Unsubscribe");
    expect(result.html).not.toContain("pixel");
  });
});
