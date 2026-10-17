# External Integrations — Project DAEDALUS

| Service | Use | Data residency | Secrets location |
|---|---|---|---|
| Stripe Checkout (EU) | Hosted payment page, PSD2/SCA | Stripe EU processing | Secret Manager: `stripe-secret-key`, `stripe-webhook-secret` |
| SendGrid | Order confirmations, shipping dispatch | Per SendGrid DPA | Secret Manager: `sendgrid-api-key` |
| Google Vertex AI | Copy generation (`gemini-3.8-flash`), image generation (`gemini-3.1-flash-image`) | `eu` multi-region endpoint — EU-boundary ML processing | ADC / functions service account |
| Firebase Auth (Identity Platform) | Admin Google sign-in; `@cvpe.dev` auto-admin | GCP project region | — |
| Google Cloud Storage | Product media, generated assets, OG cards | `europe-north1` | — |

## Notes

- Vertex model IDs are centralized in `services/functions/src/ai/models.ts` and verified by `infra/scripts/provision.sh` smoke test.
- Stripe Checkout `expires_at` minimum is 30 minutes → inventory lock TTL is **30 min** (supersedes spec's 15 min).
- Webhook endpoint `stripeWebhook` must be registered in the Stripe dashboard; signing secret goes to Secret Manager.
