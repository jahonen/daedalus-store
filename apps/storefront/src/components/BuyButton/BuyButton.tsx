"use client";

import { useState } from "react";
import { gtagEvent, getGaClientId } from "@/lib/ga";
import "./BuyButton.scss";

const CHECKOUT_URL =
  process.env.NEXT_PUBLIC_CHECKOUT_URL ??
  "https://europe-north1-daedalus-store.cloudfunctions.net/createCheckoutSession";

export interface BuyItem {
  name: string;
  priceCents: number;
}

/** Starts checkout: reserves stock server-side, redirects to Stripe. */
export function BuyButton({
  productId,
  soldOut,
  item,
}: {
  productId: string;
  soldOut: boolean;
  item?: BuyItem;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setLoading(true);
    setError(null);
    if (item) {
      gtagEvent("begin_checkout", {
        currency: "EUR",
        value: item.priceCents / 100,
        items: [
          { item_id: productId, item_name: item.name, price: item.priceCents / 100, quantity: 1 },
        ],
      });
    }
    try {
      const res = await fetch(CHECKOUT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productId, qty: 1 }],
          gaClientId: getGaClientId(),
        }),
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
