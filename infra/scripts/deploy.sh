#!/usr/bin/env bash
# Project DAEDALUS — deploy everything to the daedalus-store project.
# Order matters: functions first (URLs needed by storefront/admin env).
set -euo pipefail
cd "$(dirname "$0")/../.."
PROJECT="daedalus-store"
FN_REGION="europe-north1"

echo "=== [1/4] Functions ==="
firebase deploy --only functions --project "$PROJECT" --non-interactive --force

echo "=== [2/4] Public invoker (invoker-iam-disabled) ==="
# Org policy blocks allUsers IAM grants (domain restricted sharing), so the
# Google-recommended public-access pattern is disabling the invoker IAM check
# on the underlying Cloud Run services. Functions still enforce auth
# internally (admin claims / Stripe signature).
PUBLIC_FNS=(
  createcheckoutsession
  stripewebhook
  ensureadminrole
  generatestorefront
  chateditblock
  regenerateblock
  generateproductimage
)
for SVC in "${PUBLIC_FNS[@]}"; do
  gcloud run services update "$SVC" --no-invoker-iam-check \
    --region="$FN_REGION" --project="$PROJECT" --quiet >/dev/null \
    && echo "  $SVC: public" || echo "  $SVC: FAILED"
done

echo "=== [3/4] Admin PWA → Firebase Hosting ==="
npm run build -w @daedalus/admin
firebase deploy --only hosting:admin --project "$PROJECT" --non-interactive

echo "=== [4/4] Storefront → Cloud Run ==="
gcloud builds submit \
  --tag "${FN_REGION}-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/storefront" \
  --project="$PROJECT" \
  infra/docker
gcloud run deploy storefront \
  --image "${FN_REGION}-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/storefront" \
  --region="$FN_REGION" --project="$PROJECT" \
  --platform=managed --no-invoker-iam-check --quiet
echo "=== Deploy complete ==="
