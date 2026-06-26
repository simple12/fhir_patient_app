import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ConditionsTable } from "@/components/ConditionsTable";
import { ErrorBanner } from "@/components/ErrorBanner";
import { MedicationsTable } from "@/components/MedicationsTable";
import { VitalsSection } from "@/components/VitalsSection";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FhirApiError,
  getConditionsForPatient,
  getMedicationRequestsForPatient,
  getObservationsForPatient,
  getPatient,
  getPractitioner,
} from "@/lib/fhir-client";
import {
  formatPractitionerName,
  parseObservations,
} from "@/lib/fhir-clinical";
import {
  formatGender,
  formatPatientName,
} from "@/lib/fhir-patient";
import type {
  FhirCondition,
  FhirMedicationRequest,
  FhirPatient,
} from "@/types/fhir";

export function PatientDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<FhirPatient | null>(null);
  const [practitionerName, setPractitionerName] = useState<string | null>(null);
  const [conditions, setConditions] = useState<FhirCondition[]>([]);
  const [medications, setMedications] = useState<FhirMedicationRequest[]>([]);
  const [vitals, setVitals] = useState<ReturnType<typeof parseObservations> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Patient id is required");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const patientId = id;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [patientData, observations, conditionData, medicationData] = await Promise.all([
          getPatient(patientId),
          getObservationsForPatient(patientId),
          getConditionsForPatient(patientId),
          getMedicationRequestsForPatient(patientId),
        ]);

        if (cancelled) return;

        setPatient(patientData);
        setConditions(conditionData);
        setMedications(medicationData);
        setVitals(parseObservations(observations));

        const gpRef = patientData.generalPractitioner?.[0]?.reference;
        if (gpRef?.startsWith("Practitioner/")) {
          const practId = gpRef.replace("Practitioner/", "");
          try {
            const pract = await getPractitioner(practId);
            if (!cancelled) {
              setPractitionerName(formatPractitionerName(pract));
            }
          } catch {
            if (!cancelled) setPractitionerName(null);
          }
        } else {
          setPractitionerName(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof FhirApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Failed to load patient details";
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return (
      <div className="space-y-4">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to list
        </Link>
        <p className="text-muted-foreground">Invalid patient id.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" />
        Back to list
      </Link>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Demographics</h2>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : patient ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Full name</dt>
              <dd className="font-medium">{formatPatientName(patient)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Gender</dt>
              <dd className="font-medium">{formatGender(patient.gender)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Date of birth</dt>
              <dd className="font-medium">{patient.birthDate ?? "—"}</dd>
            </div>
            {practitionerName && (
              <div>
                <dt className="text-sm text-muted-foreground">General practitioner</dt>
                <dd className="font-medium">{practitionerName}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-muted-foreground">Patient not found.</p>
        )}
      </section>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : vitals ? (
        <VitalsSection seriesByLoinc={vitals.seriesByLoinc} />
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Conditions</h2>
        {loading ? <Skeleton className="h-32 w-full" /> : <ConditionsTable conditions={conditions} />}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Medications</h2>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <MedicationsTable medications={medications} />
        )}
      </section>
    </div>
  );
}
