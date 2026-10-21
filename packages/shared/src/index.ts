export * from "./schemas.js";
export * from "./money.js";
export * from "./address.js";
export * from "./email.js";
export * from "./email-policy.js";
export * from "./csv.js";
export * from "./omnibus.js";

export { DEFAULT_VAT_RATE } from "./schemas.js";
export const CHECKOUT_LOCK_TTL_MINUTES = 30; // Stripe Checkout min session expiry
export const REGIONS = {
  functions: "europe-north1",
  storage: "europe-north1",
  firestore: "eur3",
} as const;
