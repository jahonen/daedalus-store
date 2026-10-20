"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./CookieConsent.scss";

const KEY = "oc-cookie-consent"; // "granted" | "denied"

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

function loadGa(measurementId: string) {
  if (document.getElementById("ga-gtag")) return;
  window.dataLayer = window.dataLayer || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function gtag(...args: any[]) {
    window.dataLayer!.push(args);
  }
  gtag("js", new Date());
  gtag("config", measurementId, { anonymize_ip: true });
  const s = document.createElement("script");
  s.id = "ga-gtag";
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(s);
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
 * Lifecycle: beta — GDPR consent gate for GA4.
 * No network request to Google until the visitor accepts. Choice is stored
 * in localStorage; "Cookies" in the footer re-opens the banner. Withdrawing
 * consent clears _ga* cookies and reloads so the tag fully detaches.
 */
export function CookieConsent({ measurementId }: { measurementId: string }) {
  const [choice, setChoice] = useState<Choice | null | undefined>(undefined);

  useEffect(() => {
    const stored = localStorage.getItem(KEY);
    setChoice(stored === "granted" || stored === "denied" ? stored : null);
    if (stored === "granted") loadGa(measurementId);
  }, [measurementId]);

  useEffect(() => {
    const reopen = () => setChoice(null);
    window.addEventListener("consent:open", reopen);
    return () => window.removeEventListener("consent:open", reopen);
  }, []);

  function decide(next: Choice) {
    const was = choice ?? localStorage.getItem(KEY);
    localStorage.setItem(KEY, next);
    setChoice(next);
    window.dispatchEvent(
      new CustomEvent("consent:changed", { detail: { value: next } }),
    );
    if (next === "granted") {
      loadGa(measurementId);
    } else if (was === "granted") {
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
