# Services — Project DAEDALUS

> Every callable/deployable service is documented here. All functions: gen2, Node 22, `europe-north1`, logging on start/end/error. Lifecycle: `alpha`.

## services/functions (alpha)

| Service | Trigger | Interface | Side effects |
|---|---|---|---|
| `createCheckoutSession` | callable | in: `{items:[{productId,qty}]}`; out: `{checkoutUrl}` | Firestore txn: `reservedQuantity += qty`, write lock (30m TTL); create Stripe session (30m expiry) |
| `stripeWebhook` | HTTPS | Stripe signature-verified events | `completed`: `stock -= qty`, `reserved -= qty`, order `PENDING_FULFILLMENT`, confirmation email. `expired`: release reservation |
| `expireLocks` | schedule (5 min) | — | release expired reservations (webhook safety net) |
| `generateStorefront` | callable (admin) | in: `{pageSlug}`; out: page doc | Gemini `gemini-3.5-flash` structured output → 5-phase block draft |
| `chatEditBlock` | callable (admin) | in: `{pageSlug, blockId, message}`; out: updated block | Gemini → patch single block content |
| `regenerateBlock` | callable (admin) | in: `{pageSlug, blockId}`; out: updated block | re-query Gemini w/ fresh strategy+product context; other manual edits preserved |
| `generateProductImage` | callable (admin) | in: `{productId, prompt}`; out: `{mediaId, url}` | `gemini-2.5-flash-image` → Storage `public/` → `media` doc |
| `listOrders` | callable (admin) | in: `{status?, limit?}`; out: `{orders[]}` | orders collection is server-only; admin reads go through this |
| `markOrderFulfilled` | callable (admin) | in: `{orderId, carrier, trackingNumber}`; out: `{ok}` | status → FULFILLED; triggers `onOrderFulfilled` email |
| `onStorefrontPageWrite` | Firestore trigger | page doc change | Satori SVG → Sharp 1200×630 PNG → Storage; set `ogImageUrl` |
| `onOrderCreate` | Firestore trigger | order created | SendGrid localized confirmation + EU withdrawal docs |
| `onOrderFulfilled` | Firestore trigger | order → FULFILLED | SendGrid shipping confirmation w/ tracking URL |
| `ensureAdminRole` | callable (post-sign-in) | in: —; out: `{admin}` | `@cvpe.dev` → `admins` doc + `admin` custom claim; other domains rejected |

## Deployed services

| Service | Platform | Region |
|---|---|---|
| Storefront | Cloud Run `storefront` | europe-north1 |
| Admin PWA | Firebase Hosting `daedalus-store.web.app` | edge CDN |
| Firestore | Native mode | eur3 (EU multi-region) |
| Storage | Cloud Storage bucket | europe-north1 |

## Third-party dependencies (version-locked)

See `docs/integration.md` for external services. Notable npm deps: `firebase-functions` v6, `firebase-admin`, `stripe`, `@google/genai` (Vertex), `@sendgrid/mail`, `satori`, `sharp`, `zod`, `next` 16 (Cache Components), `react` 18/19, `@mui/material` v6, `vite` 6.

## Public HTTP access

Org policy (`iam.allowedPolicyMemberDomains`) blocks `allUsers` IAM grants.
Public-facing functions + the storefront use Google's recommended
`--no-invoker-iam-check` on the underlying Cloud Run services instead —
application-level validation (Zod, Stripe signature, admin claim) still
applies. Re-applied after every deploy by `infra/scripts/deploy.sh`.
