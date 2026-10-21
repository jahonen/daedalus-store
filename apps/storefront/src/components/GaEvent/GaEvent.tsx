"use client";

import { useEffect, useRef } from "react";
import { gtagEvent } from "@/lib/ga";

/**
 * Lifecycle: beta — fires a GA4 event once consent is granted.
 * Silent if consent was declined or the tag isn't loaded; also catches
 * late consent (accepting the banner on the same page).
 */
export function GaEvent({
  name,
  params,
}: {
  name: string;
  params?: Record<string, unknown>;
}) {
  const fired = useRef(false);

  useEffect(() => {
    function fire() {
      if (fired.current) return;
      fired.current = gtagEvent(name, params);
    }
    fire();
    function onConsent(e: Event) {
      if ((e as CustomEvent).detail?.value === "granted") fire();
    }
    window.addEventListener("consent:changed", onConsent);
    return () => window.removeEventListener("consent:changed", onConsent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
