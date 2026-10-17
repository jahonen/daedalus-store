#!/usr/bin/env bash
# Project DAEDALUS — one-time GCP/Firebase provisioning.
# Idempotent: safe to re-run. Requires: billing enabled, gcloud + firebase CLI auth'd.
set -euo pipefail

PROJECT="daedalus-store"
RUN_REGION="europe-north1"        # Hamina, FI
FIRESTORE_LOCATION="eur3"       # EU multi-region
STORAGE_LOCATION="europe-north1"

echo "=== [1/8] Checking billing ==="
BILLING=$(gcloud billing projects describe "$PROJECT" --format="value(billingEnabled)" 2>/dev/null || echo "False")
if [ "$BILLING" != "True" ]; then
  echo "ERROR: Billing not enabled on $PROJECT."
  echo "Enable it first: gcloud billing projects link $PROJECT --billing-account=ACCOUNT_ID"
  exit 1
fi
echo "Billing enabled."

echo "=== [2/8] Enabling APIs ==="
gcloud services enable \
  firestore.googleapis.com \
  run.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  identitytoolkit.googleapis.com \
  firebase.googleapis.com \
  firebasehosting.googleapis.com \
  firebasestorage.googleapis.com \
  firebaserules.googleapis.com \
  --project="$PROJECT" --quiet

echo "=== [3/8] Firestore database ($FIRESTORE_LOCATION, Native) ==="
if gcloud firestore databases describe --database="(default)" --project="$PROJECT" >/dev/null 2>&1; then
  echo "Default Firestore database already exists."
else
  gcloud firestore databases create \
    --database="(default)" \
    --location="$FIRESTORE_LOCATION" \
    --type=firestore-native \
    --project="$PROJECT"
fi

echo "=== [4/8] Firebase default Storage bucket ($STORAGE_LOCATION) ==="
# Dotted bucket names (<project>.firebasestorage.app) fail gcloud domain
# verification, so the default bucket must be created via the Firebase
# Storage management API, which provisions it service-side.
TOKEN=$(gcloud auth print-access-token)
if gcloud storage buckets describe "gs://${PROJECT}.firebasestorage.app" >/dev/null 2>&1; then
  echo "Default bucket already exists."
else
  curl -sf -X POST \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    "https://firebasestorage.googleapis.com/v1alpha/projects/$PROJECT/defaultBucket" \
    -d "{\"location\": \"$STORAGE_LOCATION\"}"
  echo
fi

echo "=== [5/8] Secrets (placeholders — add real versions) ==="
# Secret names must match defineSecret() IDs in services/functions/src/config.ts
for SECRET in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET SENDGRID_API_KEY; do
  if gcloud secrets describe "$SECRET" --project="$PROJECT" >/dev/null 2>&1; then
    echo "Secret $SECRET exists."
  else
    gcloud secrets create "$SECRET" --replication-policy=automatic --project="$PROJECT"
  fi
  if ! gcloud secrets versions list "$SECRET" --project="$PROJECT" --format="value(name)" --limit=1 | grep -q .; then
    echo -n "PLACEHOLDER_REPLACE_ME" | gcloud secrets versions add "$SECRET" --data-file=- --project="$PROJECT" >/dev/null
    echo "Added placeholder to $SECRET — replace with real value:"
    echo "  echo -n 'VALUE' | gcloud secrets versions add $SECRET --data-file=- --project=$PROJECT"
  fi
done

# Grant functions service account access to secrets + Vertex AI.
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format="value(projectNumber)")
FN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for SECRET in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET SENDGRID_API_KEY; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:$FN_SA" --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT" --quiet >/dev/null 2>&1 || true
done
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$FN_SA" --role="roles/aiplatform.user" --quiet >/dev/null 2>&1 || true

echo "=== [6/8] Firebase web app + Google sign-in provider ==="
if ! firebase apps:list --project "$PROJECT" --json 2>/dev/null | grep -q '"platform": "WEB"'; then
  firebase apps:create web "admin" --project "$PROJECT" || echo "Web app may already exist."
else
  echo "Web app already exists."
fi
# Enable Google as default supported IdP (best effort; can also be done in console).
curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://identitytoolkit.googleapis.com/v2/projects/$PROJECT/defaultSupportedIdpConfigs?idpId=google.com" \
  -d '{"enabled": true}' >/dev/null 2>&1 || echo "Google IdP already configured (or configure in Firebase console → Authentication)."

echo "=== [7/8] Deploying Firestore/Storage rules + indexes ==="
firebase deploy --only firestore:rules,firestore:indexes,storage --project "$PROJECT" --non-interactive

echo "=== [8/8] Vertex AI smoke test (EU regional endpoints) ==="
# Model availability varies per EU region; scan candidates until one works.
EU_REGIONS=("europe-west3" "europe-north1" "europe-west4" "europe-west1" "europe-southwest1" "europe-central2" "europe-west9" "europe-west8")
TEXT_MODELS=("gemini-3.8-flash" "gemini-3.5-flash" "gemini-3.5-flash-lite" "gemini-3.1-flash-lite")
IMAGE_MODELS=("gemini-3.1-flash-image" "gemini-3.1-flash-lite-image" "gemini-3-pro-image" "gemini-2.5-flash-image")
WORKING_TEXT=""
WORKING_TEXT_LOC=""
WORKING_IMAGE=""
WORKING_IMAGE_LOC=""

for M in "${TEXT_MODELS[@]}"; do
  for R in "${EU_REGIONS[@]}"; do
    if curl -sf -X POST \
      -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT" -H "Content-Type: application/json" \
      "https://${R}-aiplatform.googleapis.com/v1/projects/$PROJECT/locations/$R/publishers/google/models/$M:generateContent" \
      -d '{"contents":[{"role":"user","parts":[{"text":"Reply with the single word: ok"}]}]}' \
      | grep -q '"text"'; then
      echo "Text model OK: $M @ $R"
      WORKING_TEXT="$M"; WORKING_TEXT_LOC="$R"
      break 2
    fi
  done
  echo "Text model unavailable in EU regions: $M"
done

for M in "${IMAGE_MODELS[@]}"; do
  for R in "${EU_REGIONS[@]}"; do
    if curl -sf -X POST \
      -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT" -H "Content-Type: application/json" \
      "https://${R}-aiplatform.googleapis.com/v1/projects/$PROJECT/locations/$R/publishers/google/models/$M:generateContent" \
      -d '{"contents":[{"role":"user","parts":[{"text":"A single blue square"}]}],"generationConfig":{"responseModalities":["IMAGE"]}}' \
      | grep -q 'inlineData\|inline_data\|bytesBase64Encoded'; then
      echo "Image model OK: $M @ $R"
      WORKING_IMAGE="$M"; WORKING_IMAGE_LOC="$R"
      break 2
    fi
  done
  echo "Image model unavailable in EU regions: $M"
done

cat > "$(dirname "$0")/../models.json" <<EOF
{
  "textModel": { "id": "${WORKING_TEXT:-gemini-3.5-flash}", "location": "${WORKING_TEXT_LOC:-europe-west3}" },
  "imageModel": { "id": "${WORKING_IMAGE:-gemini-2.5-flash-image}", "location": "${WORKING_IMAGE_LOC:-europe-north1}" },
  "note": "Verified by provision.sh smoke test. Re-run to upgrade models as EU availability expands.",
  "verifiedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
echo "Wrote infra/models.json"
echo "=== Provisioning complete ==="
echo "Next: add real secret values, register Stripe webhook, then npm run deploy."
