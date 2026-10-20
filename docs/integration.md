# External Integrations — Project DAEDALUS

| Service | Use | Data residency | Secrets location |
|---|---|---|---|
| Stripe Checkout (EU) | Hosted payment page, PSD2/SCA | Stripe EU processing | Secret Manager: `stripe-secret-key`, `stripe-webhook-secret` |
| SendGrid | Order confirmations, shipping dispatch | Per SendGrid DPA | `settings/integrations.sendgrid` (admin-only Firestore) wins; Secret Manager `sendgrid-api-key` is the bootstrap fallback |
| Google Vertex AI | Copy generation (`gemini-3.5-flash` @ `europe-west3`), image generation (`gemini-2.5-flash-image` @ `europe-north1`) | EU regional endpoints (see `infra/models.json`, live-verified) | ADC / functions service account |
| Firebase Auth (Identity Platform) | Admin Google sign-in; `@cvpe.dev` auto-admin | GCP project region | — |
| Google Cloud Storage | Product media, generated assets, OG cards | `europe-north1` | — |

## Notes

- Vertex model IDs are centralized in `services/functions/src/ai/models.ts` and verified by `infra/scripts/provision.sh` smoke test.
- Stripe Checkout `expires_at` minimum is 30 minutes → inventory lock TTL is **30 min** (supersedes spec's 15 min).
- Webhook endpoint `stripeWebhook` must be registered in the Stripe dashboard; signing secret goes to Secret Manager.
- Identity Platform initialized via `identityPlatform:initializeAuth`; Google IdP configured with an IAP-created OAuth client (org blocks `oauth2.googleapis.com` API enablement).
- Storefront Cloud Run env: `REVALIDATE_TOKEN` gates `POST /api/revalidate` (re-set after every `gcloud run deploy`, which resets env vars).
- OG cards use Firebase download URLs (`alt=media`) — the default bucket has uniform access so `makePublic()`/ACLs can't be used.
