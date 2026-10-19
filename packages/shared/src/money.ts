/**
 * VAT-inclusive money helpers. All amounts are integer cents (EUR).
 * Per-line-item rounding (Finnish tax authority convention).
 */

function guardRate(vatRate: number): void {
  if (vatRate <= -1 || vatRate > 1 || !Number.isFinite(vatRate)) {
    throw new RangeError(`Invalid VAT rate: ${vatRate} (must be in (-1, 1])`);
  }
}

export function vatCents(grossCents: number, vatRate: number): number {
  guardRate(vatRate);
  return Math.round(grossCents - grossCents / (1 + vatRate));
}

export function netCents(grossCents: number, vatRate: number): number {
  guardRate(vatRate);
  return grossCents - vatCents(grossCents, vatRate);
}

export function formatEur(cents: number, locale = "fi-FI"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
}
