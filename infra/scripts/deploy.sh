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
  listorders
  markorderfulfilled
  processfavicon
  onsettingswrite
  onproductwrite
  oncampaignwrite
  onmediawrite
  registerserial
  transferownership
  getheritagerecord
  listheritagerecords
  createrepairrecord
  updaterepairrecord
  listrepairrecords
  saveartisan
  listartisans
  onartisanwrite
  chatdraftpost
  publishsocialpost
  listsocialposts
  generatesocialimage
)
for SVC in "${PUBLIC_FNS[@]}"; do
  gcloud run services update "$SVC" --no-invoker-iam-check \
    --region="$FN_REGION" --project="$PROJECT" --quiet >/dev/null \
    && echo "  $SVC: public" || echo "  $SVC: FAILED"
done

echo "=== [3/4] Admin PWA → Firebase Hosting ==="
npm run build -w @daedalus/admin
firebase deploy --only hosting --project "$PROJECT" --non-interactive

echo "=== [4/4] Storefront → Cloud Run ==="
IMAGE="${FN_REGION}-docker.pkg.dev/$PROJECT/storefront/storefront:latest"
gcloud artifacts repositories describe storefront \
  --location="$FN_REGION" --project="$PROJECT" >/dev/null 2>&1 || \
  gcloud artifacts repositories create storefront \
    --repository-format=docker --location="$FN_REGION" --project="$PROJECT"
gcloud builds submit --config infra/docker/cloudbuild.yaml --project="$PROJECT" .
gcloud run deploy storefront \
  --image "$IMAGE" \
  --region="$FN_REGION" --project="$PROJECT" \
  --platform=managed --no-invoker-iam-check --quiet \
  --set-secrets="REVALIDATE_TOKEN=REVALIDATE_TOKEN:latest"
echo "=== Deploy complete ==="
