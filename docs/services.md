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
| `chatDraftPost` | callable (admin) | in: `{message, history[]}`; out: `{reply, draft?: {text, graphemes}}` | Gemini draft using strategy + product URLs |
| `publishSocialPost` | callable (admin) | in: `{text, images?:[{storagePath,alt,width,height}]}`; out: `{uri, cid, postUrl}` | AT Proto session (settings/integrations), link facets + images embed (≤4, from Storage) or OG card embed, write `socialPosts` |
| `listSocialPosts` | callable (admin) | in: —; out: `{posts[]}` | publish history for the Social tab |
| `generateSocialImage` | callable (admin) | in: `{prompt, altText?}`; out: `{mediaId, storagePath, url}` | Gemini image → `public/social/` + media doc (post attachments) |

## Mailer engine (alpha, local implementation; activation pending)

| Service | Trigger | Interface | Side effects |
|---|---|---|---|
| `subscribeNewsletter` | public HTTPS POST | `{email, consent:true, measurement?, website?, source?}` → generic `{ok}` | rate-limit counters; pending contact/consent evidence; queued untracked DOI |
| `newsletterConfirmationDetails` | public HTTPS POST (read-only) | `{token}` → exact notice snapshots/requested choices | validates pending DOI link without consuming it; confirmation page can change optional measurement choice |
| `newsletterAction` | public HTTPS POST | `{token, action:confirm/unsubscribe/disableMeasurement}` → `{ok}` | purpose/generation/expiry checks; consent grants/withdrawals; GET never mutates |
| `newsletterOneClick` | public HTTPS POST | opaque query token, RFC 8058 | immediate marketing/measurement withdrawal, no login |
| `inviteEmailContact` | admin callable | `{email}` → `{ok}` | throttled DOI invitation, never implicit consent |
| `importEmailContacts` | admin callable | `{dryRun, entries:[{email,consentAt,evidence}]}` → eligible/skipped | max 100; explicit prior-consent evidence; existing contacts never overwritten; no measurement grant |
| `unsubscribeEmailContact` | admin callable | `{contactId}` → `{ok}` | withdraw marketing and measurement; audit actor |
| `saveEmailCampaign` | admin callable | `{id?,revision,content}` → `{id,revision}` | optimistic draft revision save |
| `testEmailCampaign` | admin callable | `{content,to}` → `{ok}` | restricted approved test address; no open/click tracking |
| `scheduleEmailCampaign` | admin callable | `{id,revision,scheduledAt}` → `{ok}` | immutable content/brand revision; current product/image validation |
| `cancelEmailCampaign` | admin callable | `{id}` → `{ok}` | stops future submissions; accepted messages cannot be recalled |
| `retryRejectedEmailCampaign` | admin callable | `{id}` → `{retried}` | up to 100 explicitly rejected/unaccepted deliveries; never auto-replays accepted, bounced or ambiguous mail |
| `prepareEmailCampaigns` | 5-minute schedule, europe-west3 | internal | paginated audience preparation (100 contacts/campaign/cycle), lease, deterministic delivery IDs; submission-state reconciliation |
| `onEmailQueued` | Firestore created | delivery ID | enqueue an authenticated Cloud Task |
| `deliverMarketingEmail` / `deliverTransactionalEmail` | separate authenticated marketing/service task workers, europe-west3 (Cloud Tasks rejects europe-north1) | `{deliveryId}` | atomic claim, suppression/consent/pause/product check; isolated SendGrid client; bounded retry/backoff; acceptance ledger |
| `recoverEmailQueue` | 5-minute schedule, europe-west3 | internal | separately recover service/marketing queues; stale submissions become ambiguous, not blind retries |
| `sendgridEvents` | public signed HTTPS POST | raw ECDSA-signed event batch | deduped delivery/bounce/complaint/unsubscribe feedback; consented approximate campaign opens |
| `chatDraftEmail` | admin callable | `{message,history}` → `{reply,content}` | Vertex strategy + active/draft product context; no recipient data; never dispatches |
| `exportEmailContact` | admin callable | `{contactId}` → profile + up to 500 consent events | audited personal-data export; no tokens or message bodies |
| `redactEmailContact` | admin callable | `{contactId,dryRun,confirmation?}` → scope preview/result | separate explicit irreversible newsletter redaction; revoke links, redact non-service delivery content and imported evidence; retain legal/service records and minimal suppression/consent audit |
| `listEmailRecords` | admin callable | `{kind,cursor?,contactId?,status?,email?}` → paginated records/cursor | audited read; delivery body/token URLs excluded from response |
| `emailAudienceSummary` | admin callable | `{}` → `{confirmed}` | pre-suppression review count |
| `emailCampaignStats` | admin callable | `{id}` → status counts | aggregation queries, accepted is not delivered |
| `saveEmailSettings` | admin callable | typed email settings → `{ok}` | marketing pause, branding/test recipients/measurement; unpause requires verified signed webhook |
| `/newsletter` | storefront GET/POST | opaque token + action | noindex/no-store/no-referrer, no app-layout analytics; GET confirmation only, POST proxies fixed backend |

`onOrderCreate` and `onOrderFulfilled` now enqueue branded HTML/text using deterministic order-event keys; cancellation notifications are separate from actual Stripe-confirmed refund notices. Checkout completed-but-unpaid stays `awaiting_payment`; async success may create an order, async failure releases reservation. Expiry sweeper checks Stripe session expiry before releasing live sessions. Stripe webhook subscriptions must include async-payment and refund-created/updated events. Legacy refund events resolve their Checkout session through Stripe when the saved payment-intent ID is absent; verify this fallback with provider test events. Pending-payment and failed-payment notices use deterministic checkout-event keys.

### Operational prerequisites and verification

Marketing defaults paused. Before activation: restore Google ADC if expired; deploy indexes/rules, functions and trusted task IAM; configure signed SendGrid Event Webhook and test it; authenticate sender domain with SPF/DKIM and review DMARC; configure verified From/reply-to and approved test addresses; verify one-click opt-out and real inbox rendering. Neither delivery task worker may receive the public-invoker workaround; separate queues prevent bulk campaigns starving service email. Grant only the runtime enqueuer/service identities the required Cloud Tasks enqueue and task invoker/service-account permissions. Do not bypass IAM when provisioning fails.

`infra/firestore.indexes.json` declares retention TTLs only for newly introduced email collections: pending contacts (30d, removed on confirmation), DOI tokens (48h), abuse counters (24h), provider/open-dedup records (30d), deliveries (90d). Preference tokens deliberately persist for old unsubscribe links. Long-term consent/suppression evidence retention and full cross-system erasure still require legal/operational review; newsletter-only redaction does not erase accounting/Heritage/service records; TTL configuration is not proof that production cleanup is enabled. Never log token URLs or recipient data; review Cloud Run access-log exclusions/redaction for newsletter token-bearing URLs before launch.

Transient provider HTTP errors retry with bounded backoff; uncertain network/provider acceptance is `ambiguous` and requires operator investigation. Exactly-once external email delivery is not guaranteed. `submitted` campaigns mean submission processing finished, not inbox delivery. Confirmed-audience review counts precede last-minute suppression; actual status counts use delivery aggregations. Open totals are approximate; no recipient open-history UI, no click tracking, no transactional/DOI tracking. Raw feedback and dedup identifiers expire after 30 days once TTL is enabled.

Emulator security/concurrency coverage is opt-in (`email.integration.test.ts`): use `firebase emulators:exec --only firestore,auth --project demo-daedalus-mailer "npm test -- services/functions/src/email/email.integration.test.ts --silent"` with `FIREBASE_CONFIG` pointing only to the same demo project/storage bucket. Tests refuse non-loopback hosts and are skipped outside the dedicated demo environment. Firebase CLI requires Java 21+; this workstation has Java 24 installed alongside the default Java 17. Select Java 24 using per-command `JAVA_HOME`/`PATH`, without changing global configuration. The suite verifies public/private reads, denial of browser-admin consent/outbox writes, and concurrent outbox deduplication; it sends no mail.

Verification commands: `npm test`; `npm run build -w @daedalus/functions` (rebuilds/venders shared); `npm run build -w @daedalus/admin`; `npm run build -w @daedalus/storefront`; `npm run lint`. Admin has no standalone `typecheck` script: its build runs `tsc -b`. A storefront build that logs Firestore auth failure may still exit zero using fallback content; never deploy that artifact as validated catalogue data.

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
