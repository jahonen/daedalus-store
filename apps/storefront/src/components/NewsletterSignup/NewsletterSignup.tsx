"use client";

import { useId, useState } from "react";
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
  const id = useId();
  return (
    <section className="newsletter-signup" aria-label="Newsletter">
      <div className="newsletter-intro">
        <p className="newsletter-eyebrow">Correspondence</p>
        <h2>Occasional letters from the atelier</h2>
        <p>New pieces, materials, repairs and stories worth keeping.</p>
      </div>
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
        <label className="newsletter-honeypot" aria-hidden="true">
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
        <div className="newsletter-field">
          <label htmlFor={`${id}-email`}>Email address</label>
          <input
            id={`${id}-email`}
            type="email"
            name="email"
            autoComplete="email"
            maxLength={254}
            placeholder="name@example.com"
            required
          />
          <button disabled={busy} type="submit">
            {busy ? "Sending…" : "Subscribe"}
          </button>
        </div>
        <div className="newsletter-consents">
          <label className="newsletter-check">
            <input type="checkbox" name="consent" required />
            {NEWSLETTER_NOTICE}
          </label>
          <label className="newsletter-check">
            <input type="checkbox" name="measurement" />
            {MEASUREMENT_NOTICE}
          </label>
        </div>
        <p className="newsletter-note">
          Handled by SendGrid. See our <a href="/legal/privacy">privacy policy</a>.
        </p>
        <p className="newsletter-status" role="status">
          {status}
        </p>
      </form>
    </section>
  );
}
