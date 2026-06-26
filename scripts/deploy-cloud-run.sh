#!/usr/bin/env bash
# Deploy patient-app only to Google Cloud Run (no bundled HAPI).
# Requires: gcloud CLI, authenticated, APIs enabled (run, cloudbuild, artifactregistry).

set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-fhir-patient-app}"
REGION="${REGION:-us-central1}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
FHIR_BASE_URL="${FHIR_BASE_URL:-https://hapi.fhir.org/baseR4}"
FHIR_ACCESS_TOKEN="${FHIR_ACCESS_TOKEN:-}"

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "Set PROJECT_ID or run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Project:  ${PROJECT_ID}"
echo "Service:  ${SERVICE_NAME}"
echo "Region:   ${REGION}"
echo "FHIR URL: ${FHIR_BASE_URL}"
echo ""

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  --project="${PROJECT_ID}"

ENV_VARS="FHIR_WAIT=false,FHIR_BASE_URL=${FHIR_BASE_URL}"
if [[ -n "${FHIR_ACCESS_TOKEN}" ]]; then
  ENV_VARS="${ENV_VARS},FHIR_ACCESS_TOKEN=${FHIR_ACCESS_TOKEN}"
fi

gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --source . \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --set-env-vars="${ENV_VARS}"

echo ""
echo "Deployed. Service URL:"
gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)'
