export * from "./schemas.js";
export * from "./money.js";
export * from "./omnibus.js";

export const CHECKOUT_LOCK_TTL_MINUTES = 30; // Stripe Checkout min session expiry
export const REGIONS = {
  functions: "europe-north1",
  storage: "europe-north1",
  firestore: "eur3",
} as const;
