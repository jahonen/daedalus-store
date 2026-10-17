import { defineSecret, defineString } from "firebase-functions/params";

export const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
export const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
export const sendgridApiKey = defineSecret("SENDGRID_API_KEY");

export const storeBaseUrl = defineString("STORE_BASE_URL", {
  default: "https://daedalus-store.web.app",
});

export const sendgridFromEmail = defineString("SENDGRID_FROM_EMAIL", {
  default: "orders@daedalus-store.web.app",
});
