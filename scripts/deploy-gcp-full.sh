#!/usr/bin/env bash
# End-to-end: provision GCE HAPI, connect Cloud Run, optionally seed demo data.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_SEED="${RUN_SEED:-true}"

bash "${ROOT}/scripts/provision-fhir-gce.sh"

VM_NAME="${VM_NAME:-fhir-hapi}"
ZONE="${ZONE:-us-central1-a}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
EXTERNAL_IP="$(gcloud compute instances describe "${VM_NAME}" \
  --zone="${ZONE}" \
  --project="${PROJECT_ID}" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"

export FHIR_BASE_URL="http://${EXTERNAL_IP}:8080/fhir"
export RUN_SEED="${RUN_SEED}"
bash "${ROOT}/scripts/connect-cloud-run-fhir.sh"
