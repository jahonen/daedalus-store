# Services — Project DAEDALUS

> Every callable/deployable service is documented here. All functions: gen2, Node 22, `europe-north1`, logging on start/end/error. Lifecycle: `alpha`.

## services/functions (alpha)

| Service | Trigger | Interface | Side effects |
|---|---|---|---|
| `createCheckoutSession` | callable | in: `{items:[{productId,qty}],email?,gaClientId?}`; out: `{checkoutUrl}` | Firestore txn: `reservedQuantity += qty`, write lock (30m TTL); create Stripe session (30m expiry) |
| `stripeWebhook` | HTTPS | Stripe signature-verified events | `completed`: `stock -= qty`, `reserved -= qty`, order `PENDING_FULFILLMENT`, confirmation email, GA4 MP `purchase` hit (non-fatal, skipped without configured secret). `expired`: release reservation |
| `expireLocks` | schedule (5 min) | — | release expired reservations (webhook safety net) |
| `generateStorefront` | callable (admin) | in: `{pageSlug}`; out: page doc | Gemini `gemini-3.5-flash` structured output → 5-phase block draft; hero image generated (non-fatal) → `media` doc + Storage `public/pages/`; preserves published status |
| `chatEditBlock` | callable (admin) | in: `{pageSlug, blockId, message}`; out: updated block | Gemini → patch single block content |
| `regenerateBlock` | callable (admin) | in: `{pageSlug, blockId}`; out: updated block | re-query Gemini w/ fresh strategy+product context; other manual edits preserved |
| `generateProductImage` | callable (admin) | in: `{productId, prompt}`; out: `{mediaId, url}` | `gemini-2.5-flash-image` → Storage `public/` → `media` doc |
| `listOrders` | callable (admin) | in: `{status?, limit?}`; out: `{orders[]}` | orders collection is server-only; admin reads go through this |
| `markOrderFulfilled` | callable (admin) | in: `{orderId, carrier, trackingNumber, serialAssignments[]}`; out: `{ok}` | status → FULFILLED + `heritageRegistry` doc per serial (txn); triggers `onOrderFulfilled` email |
| `onStorefrontPageWrite` | Firestore trigger | page doc change | Satori SVG → Sharp 1200×630 PNG → Storage; set `ogImageUrl`; calls `/api/revalidate` |
| `onSettingsWrite` | Firestore trigger | `settings/*` change | calls `/api/revalidate` (company/branding changes propagate to storefront) |
| `processFavicon` | callable (admin) | in: `{storagePath}`; out: `{ok}` | Sharp: iterative background-key + trim → favicon-16/32/48, apple-touch-icon, icon-192/512, `logo.png` → `public/brand/`; sets `settings/branding.faviconUpdatedAt` |
| `onOrderCreate` | Firestore trigger | order created | SendGrid localized confirmation + EU withdrawal docs |
| `onOrderFulfilled` | Firestore trigger | order → FULFILLED | SendGrid shipping confirmation w/ tracking URL |
| `ensureAdminRole` | callable (post-sign-in) | in: —; out: `{admin}` | `@cvpe.dev` → `admins` doc + `admin` custom claim; other domains rejected |
| `registerSerial` | callable (admin) | in: `{serialNumber, orderId, orderItemIndex, productId, ownerName, ownerEmail, ownerPhone?}`; out: `{registryId}` | `heritageRegistry` doc keyed by serial; 10-yr warranty window; history entry appended |
| `transferOwnership` | callable (admin) | in: `{serialNumber, newOwner{Name,Email,Phone}, notes}`; out: `{ok}` | owner swap, classification → `heirloom`, history appended; lifetime warranty carries over |
| `getHeritageRecord` | callable (admin) | in: `{serialNumber}`; out: `{record}` | serial → registry lookup for concierge service |
| `listHeritageRecords` | callable (admin) | in: `{productId?, classification?, limit?}`; out: `{records[]}` | registry is server-only; admin reads via this |
| `createRepairRecord` | callable (admin) | in: `{serialNumber, warrantyType: lifetime\|premium, description, technician?}`; out: `{repairId}` | `repairRecords` doc, status `requested` |
| `updateRepairRecord` | callable (admin) | in: `{repairId, status?, repairNotes?, partsUsed?, technician?, costCents?, inbound/outbound carrier+tracking}`; out: `{ok}` | full service record per serial |
| `listRepairRecords` | callable (admin) | in: `{serialNumber?, status?, limit?}`; out: `{records[]}` | repair history listing |
| `saveArtisan` | callable (admin) | in: `{id?, name, bio?, specialties?, location?, mediaAssetIds?}`; out: `{id}` | upsert `artisans` doc |
| `listArtisans` | callable (admin) | in: —; out: `{artisans[]}` | picker data for product editor |
| `onArtisanWrite` | Firestore trigger | `artisans/*` change | revalidate `artisans` + `products` tags (PDP credit) |

## Deployed services

| Service | Platform | Region |
|---|---|---|
| Storefront | Cloud Run `storefront` | europe-north1 |
| Admin PWA | Firebase Hosting `daedalus-store.web.app` | edge CDN |
| Firestore | Native mode | eur3 (EU multi-region) |
| Storage | Cloud Storage bucket | europe-north1 |

## Third-party dependencies (version-locked)

See `docs/integration.md` for external services. Notable npm deps: `firebase-functions` v6, `firebase-admin`, `stripe`, `@google/genai` (Vertex), `@sendgrid/mail`, `satori`, `sharp`, `zod`, `next` 16 (Cache Components), `react` 18/19, `@mui/material` v6, `vite` 6, `yet-another-react-lightbox` 3.32.2 (PDP image zoom lightbox).

## Public HTTP access

Org policy (`iam.allowedPolicyMemberDomains`) blocks `allUsers` IAM grants.
Public-facing functions + the storefront use Google's recommended
`--no-invoker-iam-check` on the underlying Cloud Run services instead —
application-level validation (Zod, Stripe signature, admin claim) still
applies. Re-applied after every deploy by `infra/scripts/deploy.sh`.
