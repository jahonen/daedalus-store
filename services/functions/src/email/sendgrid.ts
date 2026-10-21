import { MailService } from "@sendgrid/mail";
import { integrationsSettingsSchema } from "@daedalus/shared";
import { db } from "../admin.js";
import { sendgridApiKey, sendgridFromEmail, storeBaseUrl } from "../config.js";

/** Admin-configured key (settings/integrations) wins; cloud secret is the
 *  bootstrap fallback so existing deployments keep working. */
async function resolveCredentials(): Promise<{ apiKey: string; from: string }> {
  let configured: { apiKey: string; fromEmail: string } | undefined;
  try {
    const snap = await db.collection("settings").doc("integrations").get();
    configured = snap.exists ? integrationsSettingsSchema.parse(snap.data()).sendgrid : undefined;
  } catch {
    // fall through to env
  }
  const apiKey =
    configured?.apiKey ||
    (() => {
      try {
        return sendgridApiKey.value();
      } catch {
        return "";
      }
    })();
  if (!apiKey) {
    throw new Error(
      "SendGrid not configured — set the API key in Settings → Integrations or the SENDGRID_API_KEY secret",
    );
  }
  return {
    apiKey,
    from: configured?.fromEmail || sendgridFromEmail.value(),
  };
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
  replyTo?: string;
  senderName?: string;
  deliveryId?: string;
  trackOpens?: boolean;
}) {
  const { apiKey, from } = await resolveCredentials();
  const mail = new MailService();
  mail.setApiKey(apiKey);
  mail.setTimeout(30000);
  const [response] = await mail.send({
    to: opts.to,
    from: { email: from, name: opts.senderName },
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    headers: opts.headers,
    replyTo: opts.replyTo,
    customArgs: opts.deliveryId ? { deliveryId: opts.deliveryId } : undefined,
    trackingSettings: {
      clickTracking: { enable: false, enableText: false },
      openTracking: { enable: opts.trackOpens === true },
      subscriptionTracking: { enable: false },
    },
  });
  return String(response.headers["x-message-id"] ?? "");
}

export function withdrawalSection(storeBase: string): string {
  return [
    "",
    "— EU CONSUMER RIGHTS —",
    "You have the right to withdraw from this purchase within 14 days of",
    "receiving the goods, without giving any reason. Full terms and the",
    `withdrawal form: ${storeBase}/legal/withdrawal`,
    `Cancel your order: ${storeBase}/legal/withdrawal#cancel`,
  ].join("\n");
}

export function trackingUrl(carrier: string, trackingNumber: string): string {
  const c = carrier.toLowerCase();
  if (c.includes("posti")) return `https://www.posti.fi/en/tracking#/lahetys/${trackingNumber}`;
  if (c.includes("dhl"))
    return `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`;
  if (c.includes("matkahuolto"))
    return `https://www.matkahuolto.fi/en/tracking?number=${trackingNumber}`;
  if (c.includes("gls"))
    return `https://gls-group.com/EU/en/parcel-tracking?match=${trackingNumber}`;
  return `https://www.google.com/search?q=${encodeURIComponent(`${carrier} tracking ${trackingNumber}`)}`;
}

export { storeBaseUrl };
