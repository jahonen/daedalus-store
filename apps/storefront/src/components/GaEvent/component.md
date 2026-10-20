# GaEvent

Lifecycle: **beta**

Fires a GA4 event once consent is granted. Renders nothing.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `name` | `string` | GA4 event name (e.g. `view_item`) |
| `params` | `Record<string, unknown>` | Event payload (items, value, currency…) |

## Behavior

- Fires on mount only if `window.dataLayer` exists (i.e. consent granted and gtag loaded).
- Subscribes to the `consent:changed` event — if the visitor accepts cookies while on the page, the event fires then (once).
- Silent no-op when consent is declined or analytics is unconfigured.
- Fires at most once per mount.

## Events emitted

Whatever `name`/`params` are passed, via `gtagEvent` (`lib/ga.ts`).
