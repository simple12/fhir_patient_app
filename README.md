# FHIR Patient Management App

A web app for managing FHIR R4 Patient resources — list, search, create, edit, copy, delete, and view patient details (vitals, conditions, medications) via a secure backend proxy.

## Features

- **Patient list** — search, row selection, extended demographics columns
- **Create / edit** — dialog form with Zod validation
- **Patient details** — `/patient/{id}` with vitals charts, cross-tab vitals table, conditions, medications
- **Copy patient** — export Patient + Practitioner + Observations + Conditions + MedicationRequests as FHIR Bundle JSON to clipboard
- **Delete patient** — cascade delete of dependent Observations, Conditions, and MedicationRequests (Practitioner is preserved)
- **Docker stack** — HAPI FHIR + PostgreSQL + `patient-app`; runtime FHIR target via `config/fhir.json`

## Stack

- **Frontend:** Vite, React, TypeScript, React Router, Recharts, Tailwind CSS, shadcn/ui
- **Backend:** Express (FHIR proxy + static file server in production)
- **FHIR server:** HAPI FHIR R4 (Docker Compose locally)

## Prerequisites

- Node.js 20+ (local development)
- Docker & Docker Compose (containerized run)

## Quick start with Docker (recommended)

Run the full stack — app, HAPI FHIR, and PostgreSQL:

```bash
npm run docker:up
```

| Service | URL |
|---------|-----|
| **Patient app** (`patient-app` container) | http://localhost:3002 |
| **HAPI FHIR** | http://localhost:8082/fhir |

First startup may take 2–3 minutes while HAPI initializes. Check status:

```bash
docker compose ps
docker compose logs -f patient-app
```

Seed demo clinical data (recommended — vitals, conditions, medications, Practitioner links):

```bash
npm run seed:clinical              # 5 demo patients (default)
```

Creates **5 synthetic patients** by default (John Doe, Jane Smith, Mikki Nakamura, Maria Garcia, Robert Chen), each with linked Practitioner, vitals time-series, conditions, and medications. Re-running is idempotent. The script prints all patient ids and details URLs.

```bash
SEED_PATIENT_COUNT=3 npm run seed:clinical   # fewer patients
node scripts/generate-seed-bundle.mjs 10       # generate only, up to 5 templates exist
```

Optional — legacy patient-only files (`patient.json`, `patient2.json`):

```bash
curl -X POST http://localhost:8082/fhir/Patient \
  -H "Content-Type: application/fhir+json" \
  -d @patient.json

curl -X POST http://localhost:8082/fhir/Patient \
  -H "Content-Type: application/fhir+json" \
  -d @patient2.json
```

### External FHIR sample datasets (optional)

HL7 does not publish large ready-to-load patient *journeys* — mostly **individual example resources** and implementation guide fixtures:

| Source | What you get | Good for |
|--------|--------------|----------|
| [HL7 US Core examples (zip)](http://hl7.org/fhir/us/core/STU4/examples.html) | Individual Patient, Observation, Condition, etc. | Conformance testing, not bulk seed |
| [Synthea downloads](https://synthea.mitre.org/downloads) | 100 / 1K FHIR R4 patient JSON files (~36–81 MB) | Realistic full histories; LOINC mix differs from our vitals chart |
| [SMART sample bulk FHIR](https://github.com/smart-on-fhir/sample-bulk-fhir-datasets) | 10 / 100 / 1000 patients as ndjson (~2–183 MB zip) | Bulk import testing; needs a transform/import script for HAPI |
| [Public HAPI sandbox](https://hapi.fhir.org/baseR4) | Live shared server | Read-only demos; cannot seed your local HAPI |

For local bundled HAPI, **`npm run seed:clinical`** is the simplest path — predictable LOINC vitals and referential integrity. Synthea is optional if you need hundreds of realistic records (requires Java or a large download + custom import).

Stop everything:

```bash
npm run docker:down
```

### Switch FHIR server without restarting the container

`patient-app` mounts `config/fhir.json`. Edit that file on the host; the proxy re-reads it on every request.

**Bundled HAPI (default):**

```json
{
  "baseUrl": "http://hapi-fhir:8080/fhir",
  "accessToken": ""
}
```

**Public HAPI:**

```json
{
  "baseUrl": "https://hapi.fhir.org/baseR4",
  "accessToken": ""
}
```

**External server with auth:**

```json
{
  "baseUrl": "https://your-fhir.example.com/fhir",
  "accessToken": "your-bearer-token"
}
```

No container restart needed — save the file and the next API call uses the new target. Environment variables (`FHIR_BASE_URL`, `FHIR_ACCESS_TOKEN`) are fallbacks when the file is missing or a field is omitted.

To skip waiting for FHIR at startup (e.g. external server not ready yet), set `FHIR_WAIT=false` on `patient-app` in `docker-compose.yml`.

FHIR-only (without rebuilding the app):

```bash
npm run fhir:up
```

### Rebuild app after code changes

Docker serves a built image — rebuild to pick up UI or server changes:

```bash
docker compose up -d --build patient-app
# or full stack:
npm run docker:up
```

## Local development (without Docker for the app)

### 1. Clone and install

```bash
npm install
npm install --prefix client
npm install --prefix server
```

### 2. Configure environment

```bash
cp .env.example .env
```

Default `.env` uses `http://localhost:8082/fhir` when HAPI runs via Docker Compose (see port mapping in `docker-compose.yml`).

### 3. Start the FHIR server

```bash
npm run fhir:up
```

Wait until HAPI is ready (may take 1–2 minutes on first run):

```bash
curl http://localhost:8082/fhir/metadata
```

Optional — seed demo clinical data (vitals, conditions, meds for Patient Details page):

```bash
npm run seed:clinical
```

Open the printed `/patient/{id}` URL after seeding.

### 4. Run the app

```bash
npm run dev
```

- **UI:** http://localhost:5173
- **API proxy:** http://localhost:3001/api/fhir

The Vite dev server proxies `/api` requests to Express.

## Patient list actions

Select a row in the table, then use the header buttons:

| Button | Action |
|--------|--------|
| **New Patient** | Open create form |
| **Edit Patient** | Edit selected patient |
| **Patient Details** | Navigate to `/patient/{id}` |
| **Copy Patient** | Copy FHIR Bundle JSON (patient + practitioner + clinical resources) to clipboard |
| **Delete Patient** | Confirm, then delete patient and all linked Observations, Conditions, and MedicationRequests (Practitioner is not deleted) |

Click a patient **name** to open the details page directly.

## Patient Details page

- Demographics, vitals (**chart** or **cross-tab table** — dates as rows, vitals as columns), conditions, and medications
- Test with bundled HAPI: `npm run fhir:up` → `npm run seed:clinical` → `npm run dev` or Docker on `:3002`

## npm scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite + Express (local) |
| `npm run build` | Production build |
| `npm run docker:up` | Build and start full Docker stack |
| `npm run docker:build` | Build `patient-app` image only |
| `npm run docker:down` | Stop containers |
| `npm run fhir:up` | Start HAPI + Postgres only |
| `npm run seed:clinical` | Generate and POST demo patients + clinical data |
| `npm run seed:generate` | Generate `seed/demo-clinical-bundle.json` only |
| `npm run deploy:cloud-run` | Deploy app only to Google Cloud Run |
| `npm run deploy:fhir-gce` | Provision HAPI + Postgres on GCE |
| `npm run deploy:gcp-full` | GCE backend + connect Cloud Run + seed |

## Deployment

**Full guide:** [DEPLOYMENT.md](./DEPLOYMENT.md) · **GCP ops & cost control:** [GCP_Readme.md](./GCP_Readme.md)

| Environment | Command / approach |
|-------------|-------------------|
| **Local dev** | `npm run fhir:up` → `npm run dev` |
| **Local Docker** | `npm run docker:up` |
| **GCP app only** | Cloud Run from GitHub or `npm run deploy:cloud-run` |
| **GCP full CRUD** | `npm run deploy:gcp-full` (Cloud Run + GCE HAPI) |

On Cloud Run: set `FHIR_BASE_URL` and `FHIR_WAIT=false`; **do not set `PORT`**.

Platform comparison and alternatives: [deployment_options_to_review.md](./deployment_options_to_review.md).

## Production build

```bash
npm run build
npm run start
```

Express serves the built client from `client/dist` on `PORT` (default 3001).

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FHIR_CONFIG_PATH` | JSON file for runtime FHIR target (Docker) | unset (env vars only) |
| `FHIR_BASE_URL` | FHIR server base URL (fallback) | `http://localhost:8082/fhir` |
| `FHIR_ACCESS_TOKEN` | Bearer token (fallback) | empty |
| `FHIR_WAIT` | Wait for FHIR `/metadata` before start | `true` |
| `PORT` | Express port | `3001` |
| `VITE_API_BASE` | Client API base (empty = same origin / proxy) | empty |

## Project structure

```
client/              Vite + React UI (pages, components, lib)
  src/lib/
    fhir-client.ts           # FHIR API client
    fhir-clinical.ts         # vitals parsing, LOINC labels
    fhir-patient-bundle.ts   # copy bundle + cascade delete
server/              Express FHIR proxy
config/              Runtime FHIR target (fhir.json, mounted in Docker)
seed/                Generated demo-clinical-bundle.json
scripts/             generate-seed-bundle.mjs, seed-clinical-data.sh, deploy-*.sh
Dockerfile           Multi-stage production image (patient-app:latest)
docker-compose.yml   patient-app + HAPI FHIR + PostgreSQL (local)
docker-compose.fhir.yml   HAPI + PostgreSQL only (GCE backend)
DEPLOYMENT.md        Step-by-step deploy guide (local + GCP)
GCP_Readme.md        GCP endpoints, cost control, day-to-day ops
PRD.md               Product requirements
deployment_options_to_review.md   Hosting comparison (GCP chosen; see DEPLOYMENT.md)
```

## License

Private / project use.
