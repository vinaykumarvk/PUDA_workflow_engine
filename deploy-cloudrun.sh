#!/bin/bash
# =============================================================================
# PUDA Workflow Engine — Cloud Run Deployment Script
# Usage: ./deploy-cloudrun.sh <service> [PROJECT_ID] [REGION]
#   service: api | citizen | officer | all
#
# Required env vars for API:
#   DATABASE_URL, JWT_SECRET, ALLOWED_ORIGINS
# Required env vars for frontends:
#   VITE_API_BASE_URL (build-time, points to deployed API URL)
# =============================================================================
set -euo pipefail

SERVICE="${1:-}"
PROJECT="${2:-${GCP_PROJECT:-}}"
REGION="${3:-europe-west1}"
CLOUDSQL_INSTANCE="${CLOUDSQL_INSTANCE:-${PROJECT}:${REGION}:free-trial-first-project}"

if [[ -z "$SERVICE" ]]; then
  echo "Usage: $0 <api|citizen|officer|all> [PROJECT_ID] [REGION]"
  exit 1
fi

if [[ -z "$PROJECT" ]]; then
  echo "Error: GCP_PROJECT env var or second argument required"
  exit 1
fi

API_URL="${VITE_API_BASE_URL:-}"

deploy_api() {
  local image="gcr.io/${PROJECT}/puda-api"

  echo "=== Building api ==="
  gcloud builds submit --tag "${image}" --project "${PROJECT}" \
    --gcs-source-staging-dir="gs://${PROJECT}_cloudbuild/source" \
    --dockerfile="Dockerfile.api"

  echo "=== Deploying api to Cloud Run ==="
  gcloud run deploy "puda-api" \
    --image "${image}" \
    --project "${PROJECT}" \
    --region "${REGION}" \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --add-cloudsql-instances "${CLOUDSQL_INSTANCE}" \
    --set-env-vars "NODE_ENV=production" \
    --set-secrets "DATABASE_URL=puda-database-url:latest,JWT_SECRET=puda-jwt-secret:latest" \
    --set-env-vars "ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-*}" \
    --set-env-vars "STORAGE_BASE_DIR=/app/uploads"

  echo "=== api deployed ==="
  local url
  url=$(gcloud run services describe "puda-api" \
    --project "${PROJECT}" \
    --region "${REGION}" \
    --format 'value(status.url)')
  echo "API URL: ${url}"

  if [[ -z "$API_URL" ]]; then
    API_URL="${url}"
    echo "Frontend builds will use API_URL=${API_URL}"
  fi
}

deploy_frontend() {
  local svc=$1
  local image="gcr.io/${PROJECT}/puda-${svc}"

  if [[ -z "$API_URL" ]]; then
    echo "Error: VITE_API_BASE_URL env var required for frontend builds (or deploy api first)"
    exit 1
  fi

  echo "=== Building ${svc} (API_URL=${API_URL}) ==="
  gcloud builds submit --tag "${image}" --project "${PROJECT}" \
    --gcs-source-staging-dir="gs://${PROJECT}_cloudbuild/source" \
    --dockerfile="Dockerfile.${svc}" \
    --build-arg "VITE_API_BASE_URL=${API_URL}"

  echo "=== Deploying ${svc} to Cloud Run ==="
  gcloud run deploy "puda-${svc}" \
    --image "${image}" \
    --project "${PROJECT}" \
    --region "${REGION}" \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    --memory 256Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 5

  echo "=== ${svc} deployed ==="
  gcloud run services describe "puda-${svc}" \
    --project "${PROJECT}" \
    --region "${REGION}" \
    --format 'value(status.url)'
}

case "$SERVICE" in
  api)      deploy_api ;;
  citizen)  deploy_frontend citizen ;;
  officer)  deploy_frontend officer ;;
  all)
    deploy_api
    deploy_frontend citizen
    deploy_frontend officer
    ;;
  *)
    echo "Error: unknown service '${SERVICE}'. Use: api | citizen | officer | all"
    exit 1
    ;;
esac

echo "=== Done ==="
