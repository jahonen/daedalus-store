import { z } from "zod";
import type { CompanySettings } from "./schemas.js";
import { formatCompanyAddress } from "./address.js";

export const NEWSLETTER_NOTICE_VERSION = "2026-10-v1";
export const NEWSLETTER_NOTICE =
  "I would like to receive the newsletter and product news by email. I can unsubscribe at any time.";
export const MEASUREMENT_NOTICE =
  "I allow image-based measurement of newsletter opens for approximate campaign reporting. I can withdraw this separately at any time.";
const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", "HTTPS required");
export const emailBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().min(1).max(200) }),
  z.object({ type: z.literal("paragraph"), text: z.string().min(1).max(4000) }),
  z.object({ type: z.literal("image"), url: httpsUrl, alt: z.string().min(1).max(300) }),
  z.object({ type: z.literal("button"), url: httpsUrl, text: z.string().min(1).max(100) }),
]);
export const emailContentSchema = z.object({
  subject: z
    .string()
    .min(1)
    .max(150)
    .refine((value) => !/[\r\n]/.test(value)),
  preheader: z.string().max(200).default(""),
  blocks: z.array(emailBlockSchema).min(1).max(30),
});
export type EmailContent = z.infer<typeof emailContentSchema>;
export const emailSettingsSchema = z.object({
  marketingPaused: z.boolean().default(true),
  senderName: z.string().max(150).default(""),
  replyTo: z.union([z.literal(""), z.string().email()]).default(""),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#b3261e"),
  logoUrl: z.union([z.literal(""), httpsUrl]).default(""),
  openTrackingEnabled: z.boolean().default(false),
  testRecipients: z.array(z.string().email()).max(10).default([]),
});
export type EmailSettings = z.infer<typeof emailSettingsSchema>;
export const subscribeNewsletterSchema = z.object({
  email: z.string().trim().email().max(254),
  consent: z.literal(true),
  measurement: z.boolean().default(false),
  website: z.string().max(200).default(""),
  source: z.enum(["storefront", "checkout", "admin"]).default("storefront"),
});
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
export function escapeEmailHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
export function renderEmail(input: {
  content: EmailContent;
  company: CompanySettings;
  settings?: Partial<EmailSettings>;
  unsubscribeUrl?: string;
  preferencesUrl?: string;
}) {
  const content = emailContentSchema.parse(input.content);
  const settings = emailSettingsSchema.parse(input.settings ?? {});
  const e = escapeEmailHtml;
  const title = input.company.storefrontName || input.company.legalName;
  const blocks = content.blocks
    .map((block) => {
      if (block.type === "heading")
        return `<h2 style="font-size:24px;line-height:1.3">${e(block.text)}</h2>`;
      if (block.type === "image")
        return `<img src="${e(block.url)}" alt="${e(block.alt)}" width="536" style="width:100%;height:auto;display:block;border:0">`;
      if (block.type === "button")
        return `<p style="padding:16px 0"><a href="${e(block.url)}" style="background:${settings.accent};color:#fff;padding:14px 22px;display:inline-block;text-decoration:none;border-radius:4px">${e(block.text)}</a></p>`;
      return `<p style="line-height:1.6;white-space:pre-line">${e(block.text)}</p>`;
    })
    .join("");
  const footer = [
    input.company.legalName,
    formatCompanyAddress(input.company),
    input.company.euVatId,
    input.company.contactEmail,
  ]
    .filter(Boolean)
    .join(" · ");
  const links = input.unsubscribeUrl
    ? `<p>You receive this newsletter because you subscribed. <a href="${e(httpsUrl.parse(input.unsubscribeUrl))}">Unsubscribe</a>${input.preferencesUrl ? ` · <a href="${e(httpsUrl.parse(input.preferencesUrl))}">Preferences</a>` : ""}</p>`
    : "";
  const html = `<!doctype html><html lang="${input.company.defaultLocale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f4f6;color:#1c1c1e;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${e(content.preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="600" style="width:100%;max-width:600px;background:#fff" cellspacing="0" cellpadding="0"><tr><td style="padding:32px">${settings.logoUrl ? `<img src="${e(settings.logoUrl)}" alt="${e(title)}" width="160" style="max-width:100%;height:auto">` : `<h1 style="font-size:20px">${e(title)}</h1>`}${blocks}<hr style="border:0;border-top:1px solid #ddd"><div style="font-size:12px;line-height:1.6;color:#555">${e(footer)}${links}</div></td></tr></table></td></tr></table></body></html>`;
  if (new TextEncoder().encode(html).length > 95000)
    throw new Error("Email exceeds safe HTML size");
  const text = [
    title,
    ...content.blocks.map((b) =>
      b.type === "image" ? b.alt : b.type === "button" ? `${b.text}: ${b.url}` : b.text,
    ),
    footer,
    input.unsubscribeUrl ? `Unsubscribe: ${input.unsubscribeUrl}` : "",
    input.preferencesUrl ? `Preferences: ${input.preferencesUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { html, text };
}
