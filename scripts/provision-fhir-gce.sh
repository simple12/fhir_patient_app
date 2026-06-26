#!/usr/bin/env bash
# Provision a GCE VM running writable HAPI FHIR + PostgreSQL (docker-compose.fhir.yml).
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
ZONE="${ZONE:-us-central1-a}"
REGION="${REGION:-us-central1}"
VM_NAME="${VM_NAME:-fhir-hapi}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-standard-2}"
FIREWALL_RULE="${FIREWALL_RULE:-allow-fhir-hapi-8080}"
REPO_URL="${FHIR_REPO_URL:-https://github.com/simple12/fhir_patient_app.git}"

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

echo "Project:      ${PROJECT_ID}"
echo "Zone:         ${ZONE}"
echo "VM:           ${VM_NAME}"
echo "Machine type: ${MACHINE_TYPE}"
echo ""

gcloud services enable compute.googleapis.com --project="${PROJECT_ID}"

if ! gcloud compute firewall-rules describe "${FIREWALL_RULE}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Creating firewall rule ${FIREWALL_RULE} (tcp:8080 → VMs tagged fhir-server)..."
  gcloud compute firewall-rules create "${FIREWALL_RULE}" \
    --project="${PROJECT_ID}" \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:8080 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=fhir-server \
    --description="HAPI FHIR REST API for patient-app (demo — restrict in production)"
else
  echo "Firewall rule ${FIREWALL_RULE} already exists."
fi

if gcloud compute instances describe "${VM_NAME}" --zone="${ZONE}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "VM ${VM_NAME} already exists in ${ZONE}."
else
  echo "Creating VM ${VM_NAME} (first boot installs Docker and starts HAPI)..."
  gcloud compute instances create "${VM_NAME}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --machine-type="${MACHINE_TYPE}" \
    --boot-disk-size=30GB \
    --tags=fhir-server \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --metadata="FHIR_REPO_URL=${REPO_URL}" \
    --metadata-from-file=startup-script=scripts/gce-fhir-startup.sh
fi

EXTERNAL_IP=""
for _ in $(seq 1 30); do
  EXTERNAL_IP="$(gcloud compute instances describe "${VM_NAME}" \
    --zone="${ZONE}" \
    --project="${PROJECT_ID}" \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"
  [[ -n "${EXTERNAL_IP}" ]] && break
  sleep 2
done

if [[ -z "${EXTERNAL_IP}" ]]; then
  echo "Could not resolve VM external IP."
  exit 1
fi

FHIR_BASE_URL="http://${EXTERNAL_IP}:8080/fhir"
echo ""
echo "VM external IP: ${EXTERNAL_IP}"
echo "FHIR base URL:  ${FHIR_BASE_URL}"
echo ""
echo "Waiting for HAPI /metadata (may take 3–8 minutes on first boot)..."

for i in $(seq 1 60); do
  if curl -sf "${FHIR_BASE_URL}/metadata" >/dev/null 2>&1; then
    echo "HAPI is ready."
    echo ""
    echo "Next steps:"
    echo "  export FHIR_BASE_URL=${FHIR_BASE_URL}"
    echo "  bash scripts/connect-cloud-run-fhir.sh"
    echo "  FHIR_BASE_URL=${FHIR_BASE_URL} npm run seed:clinical"
    exit 0
  fi
  echo "  attempt ${i}/60 — not ready yet..."
  sleep 15
done

echo "HAPI did not become ready in time. Check startup logs on the VM:"
echo "  gcloud compute ssh ${VM_NAME} --zone=${ZONE} --project=${PROJECT_ID} --command='sudo journalctl -u google-startup-scripts.service --no-pager | tail -80'"
echo "  gcloud compute ssh ${VM_NAME} --zone=${ZONE} --project=${PROJECT_ID} --command='cd /opt/fhir_patient_app && sudo docker compose -f docker-compose.fhir.yml ps'"
exit 1
