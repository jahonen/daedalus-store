import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("../../../lib/firebase", () => ({ db: {}, fns: {} }));
import { EmailWorkspace } from "./EmailWorkspace";

describe("email workspace initial controls", () => {
  it("starts paused with drafting and restricted test/send controls", () => {
    const html = renderToStaticMarkup(createElement(EmailWorkspace));
    const text = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    expect(text).toMatchInlineSnapshot(`"Marketing is paused. Complete sender, webhook and queue setup before enabling broadcasts. Compose Audience Campaigns Delivery health Email settings Subject Subject Preheader Preheader paragraph Text Text Move up Remove Add paragraph Add heading Add button Add media image ​ Add media image AI drafting Do not include customer names, email addresses or other personal data in drafting requests. Describe the newsletter Describe the newsletter Draft with AI Save draft New draft Approved test recipient Approved test recipient Send test Schedule (your local time) Schedule (your local time) Review send now Email preview Plain-text alternative"`);
    expect(html).toContain('sandbox=""');
    expect(html).toContain("Marketing is paused");
  });
});
