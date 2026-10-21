"use client";

import { useState } from "react";
import { NEWSLETTER_NOTICE, MEASUREMENT_NOTICE } from "@daedalus/shared";
import { gtagEvent } from "@/lib/ga";
import "./NewsletterSignup.scss";

export function NewsletterSignup({
  source = "storefront",
}: {
  source?: "storefront" | "checkout";
}) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="newsletter-signup" aria-label="Newsletter">
      <h2>Letters from the atelier</h2>
      <p>New pieces, craftsmanship and stories worth keeping.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setStatus("");
          try {
            const response = await fetch(
              "https://europe-north1-daedalus-store.cloudfunctions.net/subscribeNewsletter",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: form.get("email"),
                  website: form.get("website"),
                  consent: form.get("consent") === "on",
                  measurement: form.get("measurement") === "on",
                  source,
                }),
                signal: AbortSignal.timeout(15000),
              },
            );
            if (!response.ok) throw new Error("Please check your address and try again.");
            setStatus(
              "If this address is eligible, a confirmation email will arrive shortly. Check your inbox to finish subscribing.",
            );
            gtagEvent("newsletter_signup_requested", { source });
          } catch {
            setStatus("We could not process your request. Please try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Email address
          <input type="email" name="email" autoComplete="email" maxLength={254} required />
        </label>
        <label className="newsletter-honeypot" aria-hidden="true">
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
        <label className="newsletter-check">
          <input type="checkbox" name="consent" required />
          {NEWSLETTER_NOTICE}
        </label>
        <label className="newsletter-check">
          <input type="checkbox" name="measurement" />
          {MEASUREMENT_NOTICE}
        </label>
        <p>
          <a href="/legal/privacy">Privacy policy</a>
        </p>
        <button disabled={busy} type="submit">
          {busy ? "Sending…" : "Subscribe"}
        </button>
        <p role="status">{status}</p>
      </form>
    </section>
  );
}
