/**
 * Cookieless operational telemetry (per global rules: visual components emit
 * analytics events). Server-side collection via the analyticsEvents
 * collection is admin-gated; here we batch to console + a listener hook so a
 * backend sink can be attached without touching components.
 */
type Listener = (event: string, payload?: Record<string, unknown>) => void;
const listeners = new Set<Listener>();

export function onAnalyticsEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function trackEvent(event: string, payload?: Record<string, unknown>) {
  for (const fn of listeners) fn(event, payload);
}
