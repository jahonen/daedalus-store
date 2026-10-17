"use client";

import { useState } from "react";
import "./BuyButton.scss";

const CHECKOUT_URL =
  process.env.NEXT_PUBLIC_CHECKOUT_URL ??
  "https://europe-north1-daedalus-store.cloudfunctions.net/createCheckoutSession";

/** Starts checkout: reserves stock server-side, redirects to Stripe. */
export function BuyButton({ productId, soldOut }: { productId: string; soldOut: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(CHECKOUT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ productId, qty: 1 }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      window.location.href = data.checkoutUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setLoading(false);
    }
  }

  if (soldOut) {
    return (
      <button className="buy-button buy-button-disabled" disabled>
        Sold out
      </button>
    );
  }

  return (
    <div className="buy-button-wrap">
      <button className="buy-button" onClick={buy} disabled={loading}>
        {loading ? "Reserving…" : "Buy now"}
      </button>
      {error && <p className="buy-error">{error}</p>}
    </div>
  );
}
