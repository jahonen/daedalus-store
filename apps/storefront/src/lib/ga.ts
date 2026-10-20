"use client";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** No-op safe event dispatch — silent when consent was declined or GA absent. */
export function gtagEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.dataLayer) return;
  window.gtag?.("event", name, params);
}

/**
 * The GA4 client_id from the _ga cookie ("GA1.1.<p1>.<p2>" → "<p1>.<p2>").
 * Passed into checkout so the server-side purchase hit attributes to the
 * same browsing session. Undefined when consent was declined (no cookie).
 */
export function getGaClientId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const raw = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("_ga="));
  if (!raw) return undefined;
  const parts = raw.slice(4).split(".");
  return parts.length >= 3 ? parts.slice(-2).join(".") : undefined;
}
