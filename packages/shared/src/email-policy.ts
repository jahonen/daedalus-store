export function classifyEmailFailure(code: unknown): "queued" | "failed" | "ambiguous" {
  const status = Number(code);
  return status === 429 || status >= 500
    ? "queued"
    : status >= 400 && status < 500
      ? "failed"
      : "ambiguous";
}
export function canConfirmNewsletter(input: {
  purpose: string;
  consumed: boolean;
  expired: boolean;
  generation: string;
  currentGeneration: string;
  status: string;
  suppressed: boolean;
}) {
  return (
    input.purpose === "confirm" &&
    !input.consumed &&
    !input.expired &&
    input.generation === input.currentGeneration &&
    input.status === "pending" &&
    !input.suppressed
  );
}
export function marketingEligibility(input: {
  paused: boolean;
  status?: string;
  suppressed: boolean;
  cancelled: boolean;
}): "allowed" | "paused" | "suppressed" {
  if (input.suppressed || input.status !== "confirmed" || input.cancelled) return "suppressed";
  return input.paused ? "paused" : "allowed";
}
export function emailScheduleIso(localValue: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localValue))
    throw new Error("Choose a valid local date and time");
  const date = new Date(localValue);
  if (!Number.isFinite(date.getTime())) throw new Error("Choose a valid local date and time");
  const pad = (value: number) => String(value).padStart(2, "0");
  const roundTrip = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (roundTrip !== localValue)
    throw new Error("This local time does not exist; choose another time (check daylight saving)");
  return date.toISOString();
}
export function checkoutPaymentConfirmed(status: string) {
  return status === "paid" || status === "no_payment_required";
}
