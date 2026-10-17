"use client";

import { useEffect, useState } from "react";
import { formatEur } from "@daedalus/shared";
import "./PriceDisplay.scss";

function useCountdown(endsAt: string | null) {
  const [remaining, setRemaining] = useState<string | null>(null);
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => {
      const ms = new Date(endsAt).getTime() - Date.now();
      if (ms <= 0) {
        setRemaining("00:00:00");
        return;
      }
      const s = Math.floor(ms / 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      setRemaining(`${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return remaining;
}

/**
 * EU Omnibus-compliant price block: sale price + 30-day lowest reference
 * price + live countdown while a campaign is active.
 */
export function PriceDisplay(props: {
  basePriceCents: number;
  salePriceCents: number | null;
  saleEndsAt: string | null;
  referencePriceCents: number | null;
}) {
  const countdown = useCountdown(props.saleEndsAt);
  const onSale = props.salePriceCents != null;

  return (
    <div className="price-display">
      {onSale ? (
        <>
          <span className="price-sale">{formatEur(props.salePriceCents!)}</span>
          <s className="price-base">{formatEur(props.basePriceCents)}</s>
          {props.referencePriceCents != null && (
            <p className="price-reference">
              Lowest price in 30 days: {formatEur(props.referencePriceCents)}
            </p>
          )}
          {countdown && countdown !== "00:00:00" && (
            <p className="price-countdown">
              Offer ends in <strong>{countdown}</strong>
            </p>
          )}
        </>
      ) : (
        <span className="price-normal">{formatEur(props.basePriceCents)}</span>
      )}
    </div>
  );
}
