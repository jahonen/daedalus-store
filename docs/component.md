# Components — Project DAEDALUS

> Every modular unit of functionality is documented here. Lifecycle tags: `alpha` | `beta` | `stable` | `deprecated`.

## apps/storefront (alpha)

| Component | Purpose | Interface |
|---|---|---|
| `BlockRenderer` | Renders the 5 Challenger-phase storefront blocks to semantic HTML | in: `StorefrontBlock[]`; out: `<section>` elements |
| `PriceDisplay` | Sale price, Omnibus `P_30d_min` reference, `hh:mm:ss` countdown | in: product + active campaign; out: price UI; side-effect: client timer |
| `BuyButton` | Starts checkout | in: productId, qty; out: redirect to Stripe Checkout; side-effect: callable `createCheckoutSession` |
| `JsonLd` | Emits `Product`/`Offer`/`Organization`/`MerchantReturnPolicy`/`BreadcrumbList` JSON-LD | in: page + product + company data; out: `<script type="application/ld+json">` |
| `LegalPage` | Renders privacy/terms/withdrawal from `settings/company` | in: company profile; out: legal HTML |
| `Breadcrumbs` | Editorial nav trail (Home › …) + `BreadcrumbList` LD | in: `items[]` `{label, href?}` + optional canonical `siteUrl`; out: `<nav aria-label="Breadcrumb">` |
| `ProductCarousel` | Snap-scroll product rail on homepage, sale-aware tiles | in: products + media map + campaigns; out: `<section>` w/ arrow scroll controls (client) |

## apps/admin (alpha)

| Component | Purpose | Interface |
|---|---|---|
| `CanvasScreen` | Block list for a storefront page | in: page doc; out: reorder/edit/regenerate ops |
| `BlockCard` | Single block: inline edit, 💬 chat, 🔄 regenerate, asset picker | in: block; out: updated block writes |
| `AmbientChat` | Bottom-sheet micro-chat for NL edit commands | in: blockId, message; out: `chatEditBlock` call |
| `ProductsScreen` | Product CRUD + stock + image gen | in: product docs; out: product writes, `generateProductImage` |
| `CampaignsScreen` | Scheduled discounts w/ Omnibus preview | in: campaign docs; out: campaign writes |
| `FulfillmentScreen` | iOS-card order list → carrier+tracking → fulfill | in: orders; out: order status writes |
| `StrategyScreen` | ICP + market insight forms | in/out: `strategy` docs |
| `SettingsScreen` | Finnish company legal profile | in/out: `settings/company` |
| `RequireAdmin` | Auth guard (Google sign-in, `admin` claim) | in: auth state; out: gated routes |

## Email and structured company data (alpha)

| Component/module | Interface | Side effects / constraints |
|---|---|---|
| `NewsletterSignup` | source storefront/checkout → email + separate unchecked newsletter/measurement choices | request DOI; consent-gated signup-request analytics; homepage and success page |
| `EmailWorkspace` | authenticated Marketing → Compose/Audience/Campaigns/Delivery health/Settings | block editor, strategy AI, exact shared HTML preview, media picker, test/schedule, paginated contact search/filter, explicit evidence-import confirmation, loaded-page CSV export, contact evidence export and separately confirmed newsletter-only redaction |
| `CompanyTab` | CompanySettings postalAddress + returnPolicyCountries | explicit verified fields; legacy address retained; return coverage is never inferred from shipping destinations |
| `IntegrationsTab` | SendGrid credentials + signed-webhook public key | admin-only settings; private credentials never included in storefront snapshot |
| `address` | company → formatted address / PostalAddress object | legacy display fallback; omit JSON-LD address when no explicit postal fields; no speculative parsing |
| `canonicalSiteUrl` | company `siteUrl` → normalized canonical origin | explicit Site Settings value wins; build/runtime fallback retained; trailing slash removed |
| `jsonld` | company/product/artisan → JSON-LD | stable organization ID; free-text artisan location stays Place.name; no fabricated offer expiry; return policy emitted only for explicitly configured countries |
| `email` | typed content blocks + company/branding → HTML and text | escaped text, HTTPS URLs, inline table layout, optional hero/alt, size limit, legal footer; no pixel by renderer |
| `email-policy` | consent/payment/provider state → eligibility/classification | pure safety decisions reused by actual handlers and unit tests |
| `csv` | CSV text → rows; value → safe export cell | bounded input, quoting support, spreadsheet-formula neutralization |
| `contacts` | public subscription/token requests + admin invitations/import | hashed tokens, one-use DOI, consent generation/evidence, membership-safe responses, separate measurement permission |
| `outbox` | deterministic key + typed outgoing email → delivery ID | durable ledger, authenticated tasks, suppression checks, transient retries, explicit ambiguous state |
| `validation` | content/production URL/brand logo → referenced active product IDs | store-owned public media only; recheck product status before submission |
| `providerSignature` | base64 ECDSA key + timestamp/signature/raw bytes → validity | bounded size/age; no payload reserialization |

Local tests cover address migration, JSON-LD fields, renderer escaping/unsafe URLs, CSV, consent HTTP transitions, payment/eligibility policy, outbox replay/pause/suppression/ambiguity and provider signatures. A deterministic HTML/text snapshot is included. Initial admin semantic-render snapshot and real-emulator security/concurrency checks are also included. Browser visual review and real inbox rendering remain activation checks, not implied by TypeScript builds.

## packages/shared (alpha)

| Component | Purpose | Interface |
|---|---|---|
| `schemas` | zod schemas: Block, Product, Order, Campaign, CompanySettings | in: unknown data; out: typed/validated |
| `money` | cents/VAT helpers | in: cents, vatRate; out: net/gross/vat amounts |
| `omnibus` | `referencePrice(history, now)` → min price in trailing 30d | pure |
