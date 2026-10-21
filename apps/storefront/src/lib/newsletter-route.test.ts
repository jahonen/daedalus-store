import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../app/newsletter/route";
afterEach(() => vi.unstubAllGlobals());
const token = "a".repeat(64);
describe("scanner-safe newsletter pages", () => {
  it("reads exact requested choices without consuming consent on GET", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          newsletterNotice: "Newsletter permission",
          measurementNotice: "Optional <measurement>",
          measurementRequested: true,
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const response = await GET(
      new Request(`https://store.example/newsletter?token=${token}&action=confirm`),
    );
    const html = await response.text();
    expect(fetch.mock.calls[0][0]).toContain("newsletterConfirmationDetails");
    expect(html).toContain("Optional &lt;measurement&gt;");
    expect(html).toContain('name="measurement" checked');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(html).not.toContain("googletagmanager");
  });
  it("does not mutate unsubscribe on scanner GET", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await GET(
      new Request(`https://store.example/newsletter?token=${token}&action=unsubscribe`),
    );
    expect(response.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("submits the confirmation page's current measurement choice", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    await POST(
      new Request("https://store.example/newsletter", {
        method: "POST",
        body: new URLSearchParams({ token, action: "confirm" }),
      }),
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      action: "confirm",
      measurement: false,
    });
  });
  it("rejects invalid tokens without backend calls", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await GET(
      new Request("https://store.example/newsletter?token=invalid&action=confirm"),
    );
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
