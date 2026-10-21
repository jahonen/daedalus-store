# External Integrations — Project DAEDALUS

| Service | Use | Data residency | Secrets location |
|---|---|---|---|
| Stripe Checkout (EU) | Hosted payment page, PSD2/SCA | Stripe EU processing | Secret Manager: `stripe-secret-key`, `stripe-webhook-secret` |
| SendGrid | Branded service, newsletter and DOI email; signed feedback; optional consented aggregate opens | Per SendGrid DPA | `settings/integrations.sendgrid` (admin-only Firestore) wins; Secret Manager `sendgrid-api-key` is the bootstrap fallback |
| Google Vertex AI | Copy generation (`gemini-3.5-flash` @ `europe-west3`), image generation (`gemini-2.5-flash-image` @ `europe-north1`) | EU regional endpoints (see `infra/models.json`, live-verified) | ADC / functions service account |
| Firebase Auth (Identity Platform) | Admin Google sign-in; `@cvpe.dev` auto-admin | GCP project region | — |
| Google Tag Manager (`GTM-5C5DLBQN`) | Storefront tag container; GA4 lives inside it. Consent Mode v2 — defaults denied, updated by `CookieConsent` | Per Google DPA | — |
| Google Cloud Storage | Product media, generated assets, OG cards | `europe-north1` | — |

## Mailer activation (alpha)

Uses installed `firebase-admin/functions`, `firebase-functions/v2/tasks`, Node crypto and `@sendgrid/mail`; no new third-party dependency. `settings/email` is admin-readable/server-writable. Contacts, consent evidence, tokens, campaign revisions, deliveries and feedback are server-only; the public snapshot allowlist remains unchanged.

Configure SendGrid's signed Event Webhook to the deployed `sendgridEvents` URL and copy its public verification key into Admin → Settings → Integrations. Select delivery, deferred, bounce, dropped, spam-report, unsubscribe/group-unsubscribe and open events. SendGrid's fake “test integration” request is unsigned and must be rejected; verify the webhook with one approved real test send and a provider event instead. Signed verification gates unpausing marketing, but does not prove sender DNS or task IAM is ready. Authenticate the sender domain and verify task execution and inbox rendering separately. Mail Send credentials should have only required sending permissions; webhook configuration can be performed separately by an authorized operator.

Each send disables click and subscription tracking overrides; open tracking is enabled only for marketing recipients who separately permitted it and when the feature is enabled. Provider global suppressions are not bypassed. Local marketing withdrawals do not block service mail, but hard delivery suppression does. Approximate opens are not proof of human reading; image proxies, caching and blocking distort counts. No email processing is claimed to stay exclusively within the EEA.

Stripe promotional consent is not used (US-merchant limitation); our own post-checkout signup requests DOI. Enable Stripe async-payment and refund webhook events for the new service-email paths. No existing buyer is automatically subscribed.

## Notes

- Vertex model IDs are centralized in `services/functions/src/ai/models.ts` and verified by `infra/scripts/provision.sh` smoke test.
- Stripe Checkout `expires_at` minimum is 30 minutes → inventory lock TTL is **30 min** (supersedes spec's 15 min).
- Webhook endpoint `stripeWebhook` must be registered in the Stripe dashboard; signing secret goes to Secret Manager.
- Identity Platform initialized via `identityPlatform:initializeAuth`; Google IdP configured with an IAP-created OAuth client (org blocks `oauth2.googleapis.com` API enablement).
- Storefront Cloud Run env: `REVALIDATE_TOKEN` gates `POST /api/revalidate` (re-set after every `gcloud run deploy`, which resets env vars).
- OG cards use Firebase download URLs (`alt=media`) — the default bucket has uniform access so `makePublic()`/ACLs can't be used.
