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
| `Breadcrumbs` | Editorial nav trail (Home › …) + `BreadcrumbList` LD | in: `items[]` `{label, href?}`; out: `<nav aria-label="Breadcrumb">` |
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

## packages/shared (alpha)

| Component | Purpose | Interface |
|---|---|---|
| `schemas` | zod schemas: Block, Product, Order, Campaign, CompanySettings | in: unknown data; out: typed/validated |
| `money` | cents/VAT helpers | in: cents, vatRate; out: net/gross/vat amounts |
| `omnibus` | `referencePrice(history, now)` → min price in trailing 30d | pure |
