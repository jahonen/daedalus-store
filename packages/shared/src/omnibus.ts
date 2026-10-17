import type { PriceHistoryEntry } from "./schemas.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * EU Omnibus Directive reference price:
 *   P_ref = min(P_t) for t ∈ [now - 30d, now]
 *
 * `history` may contain entries outside the window — they are ignored.
 * Returns null when the window has no entries (caller falls back to base price).
 */
export function referencePriceCents(
  history: PriceHistoryEntry[],
  now: Date = new Date(),
): number | null {
  const windowStart = now.getTime() - THIRTY_DAYS_MS;
  const prices = history
    .filter((h) => {
      const t = new Date(h.effectiveAt).getTime();
      return t >= windowStart && t <= now.getTime();
    })
    .map((h) => h.priceCents);
  return prices.length ? Math.min(...prices) : null;
}

/** Effective display price: active sale wins, else base. */
export function effectivePriceCents(
  basePriceCents: number,
  salePriceCents: number | null,
): number {
  return salePriceCents ?? basePriceCents;
}
