import type {
  FhirBundle,
  FhirCondition,
  FhirMedicationRequest,
  FhirObservation,
  FhirPatient,
  FhirPractitioner,
  FhirResource,
  OperationOutcome,
} from "@/types/fhir";
import { VITAL_LOINC_CODES } from "@/lib/fhir-clinical";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export class FhirApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FhirApiError";
    this.status = status;
  }
}

async function parseError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as OperationOutcome;
    if (json.resourceType === "OperationOutcome" && json.issue?.length) {
      return (
        json.issue[0].diagnostics ||
        json.issue[0].details?.text ||
        `Request failed (${response.status})`
      );
    }
    return text || `Request failed (${response.status})`;
  } catch {
    return text || `Request failed (${response.status})`;
  }
}

async function fhirFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}/api/fhir${path}`, {
    ...init,
    headers: {
      Accept: "application/fhir+json",
      "Content-Type": "application/fhir+json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new FhirApiError(await parseError(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function resourcesFromBundle<T extends FhirResource>(bundle: FhirBundle, type: string): T[] {
  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((r): r is T => r?.resourceType === type);
}

export async function searchResources<T extends FhirResource>(
  resourceType: string,
  params: Record<string, string>
): Promise<T[]> {
  const query = new URLSearchParams(params).toString();
  const bundle = await fhirFetch<FhirBundle>(`/${resourceType}?${query}`);
  return resourcesFromBundle<T>(bundle, resourceType);
}

export async function listPatients(name?: string): Promise<FhirPatient[]> {
  const query = name?.trim() ? `?name=${encodeURIComponent(name.trim())}` : "";
  const bundle = await fhirFetch<FhirBundle>(`/Patient${query}`);
  return resourcesFromBundle<FhirPatient>(bundle, "Patient");
}

export async function getPatient(id: string): Promise<FhirPatient> {
  return fhirFetch<FhirPatient>(`/Patient/${encodeURIComponent(id)}`);
}

export async function getPractitioner(id: string): Promise<FhirPractitioner> {
  return fhirFetch<FhirPractitioner>(`/Practitioner/${encodeURIComponent(id)}`);
}

export async function createPatient(patient: FhirPatient): Promise<FhirPatient> {
  return fhirFetch<FhirPatient>("/Patient", {
    method: "POST",
    body: JSON.stringify(patient),
  });
}

export async function updatePatient(patient: FhirPatient): Promise<FhirPatient> {
  if (!patient.id) {
    throw new Error("Patient id is required for update");
  }
  return fhirFetch<FhirPatient>(`/Patient/${encodeURIComponent(patient.id)}`, {
    method: "PUT",
    body: JSON.stringify(patient),
  });
}

export async function deletePatient(id: string): Promise<void> {
  await fhirFetch<void>(`/Patient/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function deleteFhirResource(resourceType: string, id: string): Promise<void> {
  await fhirFetch<void>(`/${resourceType}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getAllObservationsForPatient(patientId: string): Promise<FhirObservation[]> {
  return searchResources<FhirObservation>("Observation", {
    subject: `Patient/${patientId}`,
    _count: "500",
  });
}

export async function getObservationsForPatient(patientId: string): Promise<FhirObservation[]> {
  return searchResources<FhirObservation>("Observation", {
    subject: `Patient/${patientId}`,
    code: VITAL_LOINC_CODES.join(","),
    _sort: "date",
    _count: "200",
  });
}

export async function getConditionsForPatient(patientId: string): Promise<FhirCondition[]> {
  return searchResources<FhirCondition>("Condition", {
    patient: patientId,
    _count: "100",
  });
}

export async function getMedicationRequestsForPatient(
  patientId: string
): Promise<FhirMedicationRequest[]> {
  return searchResources<FhirMedicationRequest>("MedicationRequest", {
    patient: patientId,
    _count: "100",
  });
}
