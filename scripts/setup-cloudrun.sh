#!/bin/bash
# =============================================================================
# PUDA Workflow Engine — One-time Cloud Run setup
# Creates secrets, builds images, deploys all 3 services.
#
# Prerequisites:
#   - gcloud CLI authenticated
#   - cloud-sql-proxy running (for migration verification)
#   - Docker images build locally (npm run build:all passes)
#
# Usage: ./scripts/setup-cloudrun.sh
# =============================================================================
set -euo pipefail

PROJECT="wealth-report"
REGION="europe-west1"
CLOUDSQL_INSTANCE="wealth-report:europe-west1:free-trial-first-project"
DB_NAME="puda"
DB_USER="puda"
DB_PASS='PudaDb2026%40'  # URL-encoded (@ → %40)

# ---- Helpers ----
step() { echo -e "\n\033[1;34m=== STEP $1: $2 ===\033[0m"; }
ok()   { echo -e "\033[1;32m✅ $1\033[0m"; }
warn() { echo -e "\033[1;33m⚠️  $1\033[0m"; }

# =========================================================================
# STEP 1: Create Secret Manager secrets
# =========================================================================
step 1 "Creating secrets in Secret Manager"

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@/${DB_NAME}?host=/cloudsql/${CLOUDSQL_INSTANCE}"

create_secret() {
  local name="$1"
  local value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT" &>/dev/null; then
    warn "Secret '$name' already exists — adding new version"
    echo -n "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT"
  else
    echo -n "$value" | gcloud secrets create "$name" --data-file=- --project="$PROJECT" \
      --replication-policy=automatic
  fi
  ok "Secret '$name' ready"
}

# Generate a strong JWT secret
JWT_SECRET=$(openssl rand -base64 32)

create_secret "puda-database-url" "$DATABASE_URL"
create_secret "puda-jwt-secret"   "$JWT_SECRET"
create_secret "puda-payment-webhook-secret" "placeholder-change-when-gateway-ready"

echo ""
echo "Generated JWT_SECRET (save this): $JWT_SECRET"

# =========================================================================
# STEP 2: Grant IAM permissions to default compute service account
# =========================================================================
step 2 "Setting up IAM permissions"

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "Service account: $COMPUTE_SA"

# Secret access
for secret in puda-database-url puda-jwt-secret puda-payment-webhook-secret; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:$COMPUTE_SA" \
    --role=roles/secretmanager.secretAccessor \
    --project="$PROJECT" --quiet 2>/dev/null
  ok "Secret access: $secret"
done

# Cloud SQL client
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$COMPUTE_SA" \
  --role=roles/cloudsql.client \
  --quiet 2>/dev/null
ok "Cloud SQL client role granted"

# =========================================================================
# STEP 3: Build and deploy API
# =========================================================================
step 3 "Building API image via Cloud Build"

cd "$(dirname "$0")/.."

gcloud builds submit \
  --tag "gcr.io/${PROJECT}/puda-api" \
  --project "$PROJECT" \
  --gcs-source-staging-dir="gs://${PROJECT}_cloudbuild/source" \
  --dockerfile=Dockerfile.api \
  --quiet

ok "API image built: gcr.io/${PROJECT}/puda-api"

step 3b "Deploying API to Cloud Run"

gcloud run deploy puda-api \
  --image "gcr.io/${PROJECT}/puda-api" \
  --project "$PROJECT" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --add-cloudsql-instances "$CLOUDSQL_INSTANCE" \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "STORAGE_BASE_DIR=/app/uploads" \
  --set-env-vars "PAYMENT_GATEWAY_PROVIDER=stub" \
  --set-env-vars "EMAIL_PROVIDER=stub" \
  --set-env-vars "SMS_PROVIDER=stub" \
  --set-env-vars "ALLOWED_ORIGINS=*" \
  --set-secrets "DATABASE_URL=puda-database-url:latest" \
  --set-secrets "JWT_SECRET=puda-jwt-secret:latest" \
  --set-secrets "PAYMENT_GATEWAY_WEBHOOK_SECRET=puda-payment-webhook-secret:latest" \
  --quiet

API_URL=$(gcloud run services describe puda-api \
  --project "$PROJECT" --region "$REGION" \
  --format='value(status.url)')

ok "API deployed: $API_URL"

# Verify health
echo "Checking API health..."
sleep 5
HTTP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${API_URL}/health" || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  ok "API health check passed"
else
  warn "API health returned $HTTP_STATUS (may need a few seconds to start)"
fi

# =========================================================================
# STEP 4: Build and deploy Citizen Portal
# =========================================================================
step 4 "Building Citizen Portal (API_URL=${API_URL})"

# Frontend builds need --build-arg for VITE_API_BASE_URL, so use cloudbuild config
gcloud builds submit \
  --config=cloudbuild-frontend.yaml \
  --project "$PROJECT" \
  --gcs-source-staging-dir="gs://${PROJECT}_cloudbuild/source" \
  --substitutions="_SERVICE_NAME=puda-citizen,_APP_NAME=citizen,_VITE_API_BASE_URL=${API_URL}" \
  --quiet

ok "Citizen image built (VITE_API_BASE_URL=${API_URL})"

gcloud run deploy puda-citizen \
  --image "gcr.io/${PROJECT}/puda-citizen" \
  --project "$PROJECT" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --quiet

CITIZEN_URL=$(gcloud run services describe puda-citizen \
  --project "$PROJECT" --region "$REGION" \
  --format='value(status.url)')

ok "Citizen Portal deployed: $CITIZEN_URL"

# =========================================================================
# STEP 5: Build and deploy Officer Portal
# =========================================================================
step 5 "Building Officer Portal (API_URL=${API_URL})"

gcloud builds submit \
  --config=cloudbuild-frontend.yaml \
  --project "$PROJECT" \
  --gcs-source-staging-dir="gs://${PROJECT}_cloudbuild/source" \
  --substitutions="_SERVICE_NAME=puda-officer,_APP_NAME=officer,_VITE_API_BASE_URL=${API_URL}" \
  --quiet

ok "Officer image built (VITE_API_BASE_URL=${API_URL})"

gcloud run deploy puda-officer \
  --image "gcr.io/${PROJECT}/puda-officer" \
  --project "$PROJECT" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --quiet

OFFICER_URL=$(gcloud run services describe puda-officer \
  --project "$PROJECT" --region "$REGION" \
  --format='value(status.url)')

ok "Officer Portal deployed: $OFFICER_URL"

# =========================================================================
# STEP 6: Update API CORS with actual frontend URLs
# =========================================================================
step 6 "Updating API CORS origins with frontend URLs"

gcloud run services update puda-api \
  --project "$PROJECT" \
  --region "$REGION" \
  --update-env-vars "ALLOWED_ORIGINS=${CITIZEN_URL},${OFFICER_URL}" \
  --quiet

ok "CORS updated"

# =========================================================================
# DONE
# =========================================================================
echo ""
echo "=============================================="
echo "  PUDA Workflow Engine — Deployment Complete"
echo "=============================================="
echo ""
echo "  API:      $API_URL"
echo "  Citizen:  $CITIZEN_URL"
echo "  Officer:  $OFFICER_URL"
echo ""
echo "  Cloud SQL: $CLOUDSQL_INSTANCE / db=$DB_NAME"
echo ""
echo "  Next steps:"
echo "    1. Save the JWT_SECRET above securely"
echo "    2. Test: curl ${API_URL}/health"
echo "    3. Test: curl ${API_URL}/ready"
echo "    4. Open ${CITIZEN_URL} in browser"
echo "    5. Open ${OFFICER_URL} in browser"
echo "=============================================="
