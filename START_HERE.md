# START HERE — Project DAEDALUS

Born-in-AI e-commerce engine for a single EEA brand. Full spec: `daedalus_system_architecture.md`.

## Project structure

```
apps/storefront      Next.js 15 public store (SSG/ISR) → Cloud Run europe-north1
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
```

## Support

Repo: https://github.com/jahonen/daedalus-store — contact the repo owner for access/issues.
