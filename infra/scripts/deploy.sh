#!/usr/bin/env bash
# Project DAEDALUS — deploy everything to the daedalus-store project.
# Order matters: functions first (URLs needed by storefront/admin env).
set -euo pipefail
cd "$(dirname "$0")/../.."
PROJECT="daedalus-store"
FN_REGION="europe-north1"

echo "=== [1/4] Firestore rules/indexes and functions ==="
firebase deploy --only firestore --project "$PROJECT" --non-interactive
firebase deploy --only functions --project "$PROJECT" --non-interactive

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
  subscribenewsletter
  newsletteraction
  newsletterconfirmationdetails
  newsletteroneclick
  inviteemailcontact
  importemailcontacts
  unsubscribeemailcontact
  chatdraftemail
  saveemailcampaign
  testemailcampaign
  scheduleemailcampaign
  cancelemailcampaign
  retryrejectedemailcampaign
  listemailrecords
  exportemailcontact
  redactemailcontact
  saveemailsettings
  emailaudiencesummary
  emailcampaignstats
  sendgridevents
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
SITE_URL="$(node --input-type=module - <<'NODE'
import {execFileSync} from 'node:child_process';
try {
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], {encoding: 'utf8'}).trim();
  const r = await fetch('https://firestore.googleapis.com/v1/projects/daedalus-store/databases/(default)/documents/settings/company?mask.fieldPaths=siteUrl', {headers: {Authorization: `Bearer ${token}`}});
  const value = r.ok ? (await r.json()).fields?.siteUrl?.stringValue : '';
  console.log(value || 'https://store.ocatelier.com');
} catch {
  console.log('https://store.ocatelier.com');
}
NODE
)"
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
  --set-env-vars="NEXT_PUBLIC_SITE_URL=$SITE_URL" \
  --set-secrets="REVALIDATE_TOKEN=REVALIDATE_TOKEN:latest"
echo "=== Deploy complete ==="
