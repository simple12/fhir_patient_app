#!/bin/bash
# GCE VM startup: install Docker and run HAPI + PostgreSQL from this repo.
set -euxo pipefail

FHIR_REPO_META="$(curl -sf -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/instance/attributes/FHIR_REPO_URL 2>/dev/null || true)"
REPO_URL="${FHIR_REPO_META:-https://github.com/simple12/fhir_patient_app.git}"
INSTALL_DIR=/opt/fhir_patient_app
COMPOSE_FILE=docker-compose.fhir.yml

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
    | tee /etc/apt/sources.list.d/docker.list >/dev/null
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

systemctl enable docker
systemctl start docker

rm -rf "${INSTALL_DIR}"
git clone --depth 1 "${REPO_URL}" "${INSTALL_DIR}"
cd "${INSTALL_DIR}"

docker compose -f "${COMPOSE_FILE}" pull
docker compose -f "${COMPOSE_FILE}" up -d

echo "HAPI FHIR stack starting on port 8080 (first boot may take several minutes)."
