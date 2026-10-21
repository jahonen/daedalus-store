import { escapeEmailHtml } from "@daedalus/shared";

const endpoint = "https://europe-north1-daedalus-store.cloudfunctions.net/newsletterAction";
const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
function document(body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Newsletter preferences</title></head><body style="font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:1.5rem;color:#1c1c1e"><h1>Newsletter preferences</h1>${body}<p><a href="/">Return to the store</a></p></body></html>`;
}
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const action = url.searchParams.get("action") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token) || !["confirm", "unsubscribe", "preferences"].includes(action))
    return new Response(document("<p>This link is invalid.</p>"), { status: 400, headers });
  let consentFields = "";
  if (action === "confirm") {
    try {
      const response = await fetch(
        "https://europe-north1-daedalus-store.cloudfunctions.net/newsletterConfirmationDetails",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok)
        return new Response(
          document(
            "<p>This confirmation link is invalid or expired. Please request a new signup.</p>",
          ),
          { status: 400, headers },
        );
      const details = (await response.json()) as {
        newsletterNotice: string;
        measurementNotice: string;
        measurementRequested: boolean;
      };
      consentFields = `<p>${escapeEmailHtml(details.newsletterNotice)}</p><label><input type="checkbox" name="measurement" ${details.measurementRequested ? "checked" : ""}> ${escapeEmailHtml(details.measurementNotice)}</label>`;
    } catch {
      return new Response(
        document("<p>We could not load your choices. Please try again later.</p>"),
        { status: 503, headers },
      );
    }
  }
  const choices =
    action === "confirm"
      ? [["confirm", "Confirm newsletter subscription"]]
      : action === "unsubscribe"
        ? [["unsubscribe", "Unsubscribe from all marketing emails"]]
        : [
            ["disableMeasurement", "Stop open measurement, keep newsletter"],
            ["unsubscribe", "Unsubscribe from all marketing emails"],
          ];
  const forms = choices
    .map(
      ([value, label]) =>
        `<form method="post"><input type="hidden" name="token" value="${token}"><input type="hidden" name="action" value="${value}">${consentFields}<button type="submit" style="padding:12px;margin:8px 0">${label}</button></form>`,
    )
    .join("");
  return new Response(
    document(
      `<p>${action === "confirm" ? "Confirm the newsletter and optional measurement choices you selected when signing up. If you did not request this, close this page." : "You can withdraw permission without signing in."}</p>${forms}`,
    ),
    { headers },
  );
}
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data"))
    return new Response(document("<p>This link is invalid.</p>"), { status: 400, headers });
  const form = await request.formData().catch(() => null);
  if (!form)
    return new Response(document("<p>This link is invalid.</p>"), { status: 400, headers });
  const token = form.get("token");
  const action = form.get("action");
  if (
    typeof token !== "string" ||
    !/^[a-f0-9]{64}$/.test(token) ||
    !["confirm", "unsubscribe", "disableMeasurement"].includes(String(action))
  )
    return new Response(document("<p>This link is invalid.</p>"), { status: 400, headers });
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action, measurement: form.get("measurement") === "on" }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    return new Response(
      document(
        `<p>${response.ok ? (action === "confirm" ? "Your newsletter subscription is confirmed." : "Your preferences have been updated.") : "This link is invalid or expired. Please request a new one."}</p>`,
      ),
      { status: response.ok ? 200 : 400, headers },
    );
  } catch {
    return new Response(
      document("<p>We could not update your preferences. Please try again.</p>"),
      { status: 503, headers },
    );
  }
}
