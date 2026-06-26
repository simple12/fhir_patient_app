# GCP Operations Guide

Quick reference for the **FHIR Patient App** deployment on Google Cloud Platform.

> Full deploy instructions: [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## Architecture

```
Browser  →  Cloud Run (patient-app)  →  GCE VM (HAPI + PostgreSQL)
              HTTPS                         HTTP :8080
```

| Resource | Name | Region / zone |
|----------|------|----------------|
| GCP project | `project-cdefc944-2bcb-4979-aee` | — |
| Cloud Run service | `fhir-patient-app-git` | `us-west2` |
| GCE VM | `fhir-hapi` | `us-west2-a` |
| Machine type | `e2-standard-2` (2 vCPU, 8 GB RAM) | — |
| Firewall rule | `allow-fhir-hapi-8080` | tcp:8080 → `fhir-server` tag |

---

## Endpoints

### User-facing (open in browser)

| Purpose | URL |
|---------|-----|
| **Patient app (home)** | https://fhir-patient-app-git-6u4dzleznq-wl.a.run.app |
| **Patient details** | `https://fhir-patient-app-git-6u4dzleznq-wl.a.run.app/patient/{id}` |
| Example (John Doe) | https://fhir-patient-app-git-6u4dzleznq-wl.a.run.app/patient/1002 |

### App API (via Cloud Run proxy)

All FHIR traffic goes through Express — the browser never calls HAPI directly.

| Purpose | Method | URL |
|---------|--------|-----|
| FHIR proxy (all resources) | * | `https://fhir-patient-app-git-6u4dzleznq-wl.a.run.app/api/fhir/{path}` |
| List / search patients | GET | `.../api/fhir/Patient` |
| Read patient | GET | `.../api/fhir/Patient/{id}` |
| Create patient | POST | `.../api/fhir/Patient` |
| Update patient | PUT | `.../api/fhir/Patient/{id}` |
| Delete patient | DELETE | `.../api/fhir/Patient/{id}` |
| Observations | GET | `.../api/fhir/Observation?subject=Patient/{id}` |
| Conditions | GET | `.../api/fhir/Condition?patient={id}` |
| Medications | GET | `.../api/fhir/MedicationRequest?patient={id}` |

### FHIR server (GCE — server-side only)

Used by Cloud Run via `FHIR_BASE_URL`. **Do not expose to end users** in production without auth/TLS hardening.

| Purpose | URL |
|---------|-----|
| **FHIR base** | http://34.20.191.118:8080/fhir |
| Metadata / health | http://34.20.191.118:8080/fhir/metadata |
| Patient (direct) | http://34.20.191.118:8080/fhir/Patient |
| Transaction bundle (seed) | POST http://34.20.191.118:8080/fhir |

PostgreSQL runs **inside the VM** on the Docker network only — not exposed publicly.

### Refresh current URLs

Cloud Run URL and VM IP can change after redeploy or VM recreate:

```bash
gcloud config set project project-cdefc944-2bcb-4979-aee

# App URL
gcloud run services describe fhir-patient-app-git \
  --region=us-west2 \
  --format='value(status.url)'

# VM external IP
gcloud compute instances describe fhir-hapi \
  --zone=us-west2-a \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'

# Cloud Run FHIR_BASE_URL env
gcloud run services describe fhir-patient-app-git \
  --region=us-west2 \
  --format='yaml(spec.template.spec.containers[0].env)'
```

If the VM IP changes, update Cloud Run:

```bash
export FHIR_BASE_URL=http://NEW_VM_IP:8080/fhir
REGION=us-west2 SERVICE_NAME=fhir-patient-app-git bash scripts/connect-cloud-run-fhir.sh
```

---

## Cloud Run environment

| Variable | Current value | Notes |
|----------|---------------|--------|
| `FHIR_BASE_URL` | `http://34.20.191.118:8080/fhir` | Writable GCE HAPI |
| `FHIR_WAIT` | `false` | Required on Cloud Run |
| `PORT` | *(injected)* | **Do not set manually** — Cloud Run sets `8080` |

---

## Cost control

### Estimated cost

| Scenario | Approx. cost |
|----------|----------------|
| **VM running 24 hours** | ~**$2/day** (compute + disk) |
| **VM running 24/7 (month)** | ~**$50–60/month** |
| **VM stopped** | ~**$1–3/month** (boot disk only) |
| **Cloud Run (light demo traffic)** | Often **$0–5/month** (scales to zero when idle) |

### Stop VM (save ~$2/day — **recommended when not demoing**)

Stops compute billing. **Data is kept** on the boot disk. Cloud Run will error until the VM is started again.

```bash
gcloud compute instances stop fhir-hapi --zone=us-west2-a
```

### Start VM again

```bash
gcloud compute instances start fhir-hapi --zone=us-west2-a

# Wait for HAPI (2–5 min after start)
curl -sf http://34.20.191.118:8080/fhir/metadata && echo "HAPI ready"
```

If the external IP changed after stop/start (unlikely on same VM, but possible):

```bash
NEW_IP=$(gcloud compute instances describe fhir-hapi --zone=us-west2-a \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
echo "http://${NEW_IP}:8080/fhir"
```

### Check VM status

```bash
gcloud compute instances list --filter="name=fhir-hapi"
```

### Delete VM entirely (remove all FHIR data on that disk)

**Irreversible** — only if you want to tear down the backend completely.

```bash
gcloud compute instances delete fhir-hapi --zone=us-west2-a
```

To reprovision later: `npm run deploy:fhir-gce`

### Delete Cloud Run service

```bash
gcloud run services delete fhir-patient-app-git --region=us-west2
```

Redeploy from GitHub or: `REGION=us-west2 SERVICE_NAME=fhir-patient-app-git npm run deploy:cloud-run`

### Delete firewall rule (optional cleanup)

```bash
gcloud compute firewall-rules delete allow-fhir-hapi-8080
```

---

## Day-to-day commands

### View Cloud Run logs

```bash
gcloud run services logs read fhir-patient-app-git --region=us-west2 --limit=50
```

### SSH into FHIR VM

```bash
gcloud compute ssh fhir-hapi --zone=us-west2-a
```

### Check HAPI containers on VM

```bash
gcloud compute ssh fhir-hapi --zone=us-west2-a \
  --command='sudo docker compose -f /opt/fhir_patient_app/docker-compose.fhir.yml ps'
```

### Restart HAPI stack on VM

```bash
gcloud compute ssh fhir-hapi --zone=us-west2-a \
  --command='cd /opt/fhir_patient_app && sudo docker compose -f docker-compose.fhir.yml restart'
```

### Seed demo patients (from your laptop)

```bash
FHIR_BASE_URL=http://34.20.191.118:8080/fhir npm run seed:clinical
```

### Redeploy app after code push to GitHub

Cloud Run continuous deploy rebuilds automatically on push to `main`.

Manual redeploy:

```bash
REGION=us-west2 SERVICE_NAME=fhir-patient-app-git npm run deploy:cloud-run
```

---

## GCP Console links

Replace `project-cdefc944-2bcb-4979-aee` if your project differs.

| Resource | Console |
|----------|---------|
| Cloud Run service | [Open service](https://console.cloud.google.com/run/detail/us-west2/fhir-patient-app-git?project=project-cdefc944-2bcb-4979-aee) |
| Compute VM | [Open VM instances](https://console.cloud.google.com/compute/instances?project=project-cdefc944-2bcb-4979-aee) |
| Billing | [Billing overview](https://console.cloud.google.com/billing?project=project-cdefc944-2bcb-4979-aee) |
| Firewall rules | [VPC firewall](https://console.cloud.google.com/networking/firewalls/list?project=project-cdefc944-2bcb-4979-aee) |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| App loads, patient list fails | VM stopped or HAPI down | `gcloud compute instances start fhir-hapi --zone=us-west2-a` |
| App hangs at startup | `FHIR_WAIT=true` without reachable FHIR | Set `FHIR_WAIT=false` on Cloud Run |
| Create/edit fails | Read-only FHIR (public sandbox) | Use GCE HAPI; check `FHIR_BASE_URL` |
| Empty patient list after VM restart | DB empty / not seeded | `FHIR_BASE_URL=... npm run seed:clinical` |
| Wrong FHIR after VM recreate | IP changed | Run `scripts/connect-cloud-run-fhir.sh` with new IP |

---

## Security reminder (demo setup)

- HAPI port **8080 is open to the internet** (`0.0.0.0/0`).
- Use **synthetic data only** — no real PHI.
- For production: VPC private networking, HTTPS, authentication, restrict firewall.

---

*Last verified against live deployment. Re-run the “Refresh current URLs” commands after infrastructure changes.*
