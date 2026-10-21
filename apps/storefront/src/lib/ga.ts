"use client";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function analyticsGranted() {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage.getItem("oc-cookie-consent") === "granted"
    );
  } catch {
    return false;
  }
}

/**
 * Pushes a custom event to the GTM dataLayer — silent when consent was
 * declined. Returns true when the event was actually queued, so callers
 * can retry after a late `consent:changed`.
 */
export function gtagEvent(name: string, params?: Record<string, unknown>) {
  if (!analyticsGranted()) return false;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: name, ...params });
  return true;
}

/**
 * The GA4 client_id from the _ga cookie ("GA1.1.<p1>.<p2>" → "<p1>.<p2>").
 * Passed into checkout so the server-side purchase hit attributes to the
 * same browsing session. Undefined when consent was declined (no cookie).
 */
export function getGaClientId(): string | undefined {
  if (typeof document === "undefined" || !analyticsGranted()) return undefined;
  const raw = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("_ga="));
  if (!raw) return undefined;
  const parts = raw.slice(4).split(".");
  return parts.length >= 3 ? parts.slice(-2).join(".") : undefined;
}
