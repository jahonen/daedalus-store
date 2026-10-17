# START HERE — Project DAEDALUS

Born-in-AI e-commerce engine for a single EEA brand. Full spec: `daedalus_system_architecture.md`.

## Project structure

```
apps/storefront      Next.js 16 public store (Cache Components/ISR) → Cloud Run europe-north1
apps/admin           Vite + React + MUI v6 admin PWA → Firebase Hosting
services/functions   Cloud Functions gen2 (Node 22, europe-north1)
packages/shared      Types, zod schemas, money/VAT/Omnibus helpers
infra/               firebase config, rules, indexes, provision/seed/deploy scripts
docs/                component.md · services.md · integration.md
```

## Data plane (all EEA)

Firestore `eur3` · Storage `europe-north1` · Cloud Run/Functions `europe-north1` · Vertex AI `eu` multi-region endpoint.

## Conventions

- PascalCase components, camelCase functions, kebab-case files/folders (framework rules win).
- `fetch`/`load`/`get` prefixes for async work.
- Every component documented in `docs/component.md`, every service in `docs/services.md`, third-party deps and external services in `docs/integration.md`.
- Lifecycle tags: `alpha` | `beta` | `stable` | `deprecated` — everything currently `alpha`.
- Admin visual components: `src/components/<Name>/<Name>.tsx` + `<Name>.scss`; shared styles in `main.scss`.

## Common commands

```bash
npm install
npm run emulators            # local Firebase suite
npm run dev:admin            # admin PWA dev server
npm run dev:storefront       # storefront dev server
npm run provision            # one-time GCP provisioning (billing required)
npm run seed                 # demo brand data
npm run deploy               # deploy everything
npm test && npm run typecheck && npm run lint
node infra/scripts/seed-demo.mjs   # demo content + live generateStorefront smoke
```

## Secrets (required before live checkout/email)

Placeholder versions exist so deploys are non-interactive. Add real values:

```bash
echo -n "sk_live_..." | gcloud secrets versions add STRIPE_SECRET_KEY --data-file=- --project daedalus-store
echo -n "whsec_..."  | gcloud secrets versions add STRIPE_WEBHOOK_SECRET --data-file=- --project daedalus-store
echo -n "SG...."     | gcloud secrets versions add SENDGRID_API_KEY --data-file=- --project daedalus-store
```

Then register `https://europe-north1-daedalus-store.cloudfunctions.net/stripeWebhook`
in the Stripe dashboard (events: `checkout.session.completed`, `checkout.session.expired`).

## Live URLs

- Storefront: https://storefront-229074810509.europe-north1.run.app
- Admin:      https://daedalus-store.web.app (Google sign-in, `@cvpe.dev` → auto-admin)

## Support

Repo: https://github.com/jahonen/daedalus-store — contact the repo owner for access/issues.
