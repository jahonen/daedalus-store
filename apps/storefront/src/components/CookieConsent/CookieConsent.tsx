"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./CookieConsent.scss";

const KEY = "oc-cookie-consent"; // "granted" | "denied"

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function updateConsent(value: Choice) {
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ??
    function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
  window.gtag("consent", "update", {
    analytics_storage: value,
    ad_storage: value,
    ad_user_data: value,
    ad_personalization: value,
  });
}

function clearGaCookies() {
  const host = location.hostname;
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0].trim();
    if (!name.startsWith("_ga")) continue;
    for (const domain of [host, `.${host.split(".").slice(-2).join(".")}`]) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}`;
      document.cookie = `${name}=; Max-Age=0; path=/`;
    }
  }
}

type Choice = "granted" | "denied";

/**
 * Lifecycle: beta — GDPR consent gate for Google Tag Manager (Consent Mode v2).
 * GTM loads in <head> with all storage denied; this banner only pushes
 * `consent update` signals to the dataLayer. Choice is stored in
 * localStorage; "Cookies" in the footer re-opens the banner. Withdrawing
 * consent clears _ga* cookies and reloads so tags fully detach.
 */
export function CookieConsent() {
  const [choice, setChoice] = useState<Choice | null | undefined>(undefined);

  useEffect(() => {
    const stored = localStorage.getItem(KEY);
    setChoice(stored === "granted" || stored === "denied" ? stored : null);
    if (stored === "granted" || stored === "denied") updateConsent(stored);
  }, []);

  useEffect(() => {
    const reopen = () => setChoice(null);
    window.addEventListener("consent:open", reopen);
    return () => window.removeEventListener("consent:open", reopen);
  }, []);

  function decide(next: Choice) {
    const was = choice ?? localStorage.getItem(KEY);
    localStorage.setItem(KEY, next);
    setChoice(next);
    updateConsent(next); // before listeners fire
    window.dispatchEvent(
      new CustomEvent("consent:changed", { detail: { value: next } }),
    );
    if (next === "denied" && was === "granted") {
      clearGaCookies();
      location.reload();
    }
  }

  if (choice !== null) return null;

  return (
    <div className="cookie-consent" role="dialog" aria-label="Cookie consent">
      <p>
        We use cookies for anonymous analytics to improve the store. Accept to
        help us, or continue without tracking.
      </p>
      <div className="cookie-actions">
        <Link href="/legal/privacy" className="cookie-link">
          Privacy
        </Link>
        <button type="button" className="cookie-btn reject" onClick={() => decide("denied")}>
          Decline
        </button>
        <button type="button" className="cookie-btn accept" onClick={() => decide("granted")}>
          Accept
        </button>
      </div>
    </div>
  );
}

/** Footer link that re-opens the consent banner. */
export function CookiePreferencesButton() {
  return (
    <button
      type="button"
      className="cookie-pref"
      onClick={() => window.dispatchEvent(new Event("consent:open"))}
    >
      Cookies
    </button>
  );
}
