import sgMail from "@sendgrid/mail";
import { sendgridApiKey, sendgridFromEmail, storeBaseUrl } from "../config.js";

let configured = false;

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  if (!configured) {
    sgMail.setApiKey(sendgridApiKey.value());
    configured = true;
  }
  await sgMail.send({
    to: opts.to,
    from: sendgridFromEmail.value(),
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
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
  if (c.includes("dhl")) return `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`;
  if (c.includes("matkahuolto")) return `https://www.matkahuolto.fi/en/tracking?number=${trackingNumber}`;
  if (c.includes("gls")) return `https://gls-group.com/EU/en/parcel-tracking?match=${trackingNumber}`;
  return `https://www.google.com/search?q=${encodeURIComponent(`${carrier} tracking ${trackingNumber}`)}`;
}

export { storeBaseUrl };
