/**
 * VAT-inclusive money helpers. All amounts are integer cents (EUR).
 */

export function vatCents(grossCents: number, vatRate: number): number {
  return Math.round(grossCents - grossCents / (1 + vatRate));
}

export function netCents(grossCents: number, vatRate: number): number {
  return grossCents - vatCents(grossCents, vatRate);
}

export function formatEur(cents: number, locale = "fi-FI"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
}
