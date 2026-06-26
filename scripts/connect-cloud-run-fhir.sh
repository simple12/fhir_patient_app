#!/usr/bin/env bash
# Point the Cloud Run patient-app at a writable FHIR server (e.g. GCE HAPI).
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-fhir-patient-app}"
VM_NAME="${VM_NAME:-fhir-hapi}"
ZONE="${ZONE:-us-central1-a}"
FHIR_ACCESS_TOKEN="${FHIR_ACCESS_TOKEN:-}"
RUN_SEED="${RUN_SEED:-false}"

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "Set PROJECT_ID or run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

if [[ -z "${FHIR_BASE_URL:-}" ]]; then
  EXTERNAL_IP="$(gcloud compute instances describe "${VM_NAME}" \
    --zone="${ZONE}" \
    --project="${PROJECT_ID}" \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"
  if [[ -z "${EXTERNAL_IP}" ]]; then
    echo "Set FHIR_BASE_URL or ensure VM ${VM_NAME} has an external IP."
    exit 1
  fi
  FHIR_BASE_URL="http://${EXTERNAL_IP}:8080/fhir"
fi

echo "Updating Cloud Run service ${SERVICE_NAME}..."
echo "  FHIR_BASE_URL=${FHIR_BASE_URL}"

ENV_VARS="FHIR_WAIT=false,FHIR_BASE_URL=${FHIR_BASE_URL}"
if [[ -n "${FHIR_ACCESS_TOKEN}" ]]; then
  ENV_VARS="${ENV_VARS},FHIR_ACCESS_TOKEN=${FHIR_ACCESS_TOKEN}"
fi

gcloud run services update "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --set-env-vars="${ENV_VARS}"

APP_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')"

echo ""
echo "Cloud Run app: ${APP_URL}"
echo "FHIR server:   ${FHIR_BASE_URL}"

if [[ "${RUN_SEED}" == "true" ]]; then
  echo ""
  echo "Seeding demo clinical data..."
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  FHIR_BASE_URL="${FHIR_BASE_URL}" bash "${ROOT}/scripts/seed-clinical-data.sh"
fi

echo ""
echo "Done. Open ${APP_URL} — create/edit/delete should work against your GCE HAPI server."
