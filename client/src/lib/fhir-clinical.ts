import type {
  CodeableConcept,
  FhirCondition,
  FhirMedicationRequest,
  FhirObservation,
} from "@/types/fhir";

export const VITAL_LOINC_CODES = [
  "8867-4",
  "8310-5",
  "9279-1",
  "59408-5",
  "8302-2",
  "29463-7",
  "39156-5",
  "55284-4",
  "8480-6",
  "8462-4",
] as const;

export const LOINC_LABELS: Record<string, string> = {
  "8867-4": "Heart rate",
  "8310-5": "Temperature",
  "9279-1": "Respiratory rate",
  "59408-5": "Oxygen saturation",
  "8302-2": "Height",
  "29463-7": "Weight",
  "39156-5": "BMI",
  "55284-4": "Blood pressure panel",
  "8480-6": "Systolic BP",
  "8462-4": "Diastolic BP",
};

export type VitalDataPoint = {
  date: string;
  value: number;
  unit: string;
  label: string;
};

export type VitalSeries = {
  loinc: string;
  label: string;
  points: VitalDataPoint[];
};

export type VitalTableRow = {
  vital: string;
  date: string;
  value: string;
};

function getLoincCode(concept?: CodeableConcept): string | undefined {
  return concept?.coding?.find((c) => c.system?.includes("loinc"))?.code ?? concept?.coding?.[0]?.code;
}

function getEffectiveDate(obs: FhirObservation): string {
  return obs.effectiveDateTime ?? obs.effectivePeriod?.start ?? "";
}

function formatDisplayValue(value: number, unit: string): string {
  return unit ? `${value} ${unit}` : String(value);
}

function addPoint(
  map: Map<string, VitalDataPoint[]>,
  loinc: string,
  date: string,
  value: number | undefined,
  unit: string
): void {
  if (!date || value === undefined || Number.isNaN(value)) return;
  const points = map.get(loinc) ?? [];
  points.push({
    date,
    value,
    unit,
    label: LOINC_LABELS[loinc] ?? loinc,
  });
  map.set(loinc, points);
}

export function parseObservations(observations: FhirObservation[]): {
  seriesByLoinc: Map<string, VitalDataPoint[]>;
  tableRows: VitalTableRow[];
} {
  const map = new Map<string, VitalDataPoint[]>();

  for (const obs of observations) {
    const date = getEffectiveDate(obs);
    const mainLoinc = getLoincCode(obs.code);

    if (obs.valueQuantity?.value !== undefined && mainLoinc) {
      addPoint(map, mainLoinc, date, obs.valueQuantity.value, obs.valueQuantity.unit ?? "");
    }

    for (const component of obs.component ?? []) {
      const loinc = getLoincCode(component.code);
      if (loinc && component.valueQuantity?.value !== undefined) {
        addPoint(map, loinc, date, component.valueQuantity.value, component.valueQuantity.unit ?? "");
      }
    }
  }

  for (const [loinc, points] of map) {
    points.sort((a, b) => a.date.localeCompare(b.date));
    map.set(loinc, points);
  }

  const tableRows: VitalTableRow[] = [];
  for (const [loinc, points] of map) {
    for (const p of points) {
      tableRows.push({
        vital: LOINC_LABELS[loinc] ?? loinc,
        date: p.date.slice(0, 10),
        value: formatDisplayValue(p.value, p.unit),
      });
    }
  }
  tableRows.sort((a, b) => a.date.localeCompare(b.date));

  return { seriesByLoinc: map, tableRows };
}

export type VitalCrossTabColumn = {
  loinc: string;
  label: string;
};

export type VitalCrossTabRow = {
  date: string;
  values: Record<string, string>;
};

/** Column order for cross-tab table (vitals as columns, dates as rows). */
const CROSS_TAB_COLUMN_ORDER = [
  "8867-4",
  "8310-5",
  "9279-1",
  "59408-5",
  "8302-2",
  "29463-7",
  "39156-5",
  "8480-6",
  "8462-4",
] as const;

const CROSS_TAB_SKIP = new Set(["55284-4"]);

export function buildVitalsCrossTab(map: Map<string, VitalDataPoint[]>): {
  columns: VitalCrossTabColumn[];
  rows: VitalCrossTabRow[];
} {
  const columns: VitalCrossTabColumn[] = CROSS_TAB_COLUMN_ORDER.filter(
    (loinc) => !CROSS_TAB_SKIP.has(loinc) && (map.get(loinc)?.length ?? 0) > 0
  ).map((loinc) => ({
    loinc,
    label: LOINC_LABELS[loinc] ?? loinc,
  }));

  const dateSet = new Set<string>();
  for (const col of columns) {
    for (const p of map.get(col.loinc) ?? []) {
      dateSet.add(p.date.slice(0, 10));
    }
  }

  const rows: VitalCrossTabRow[] = Array.from(dateSet)
    .sort((a, b) => a.localeCompare(b))
    .map((date) => {
      const values: Record<string, string> = {};
      for (const col of columns) {
        const point = (map.get(col.loinc) ?? []).find((p) => p.date.slice(0, 10) === date);
        values[col.loinc] = point ? formatDisplayValue(point.value, point.unit) : "—";
      }
      return { date, values };
    });

  return { columns, rows };
}

export function getVitalSeriesList(map: Map<string, VitalDataPoint[]>): VitalSeries[] {
  const skipBpComponents = new Set(["8480-6", "8462-4", "55284-4"]);
  const result: VitalSeries[] = [];

  for (const [loinc, points] of map) {
    if (skipBpComponents.has(loinc)) continue;
    result.push({
      loinc,
      label: LOINC_LABELS[loinc] ?? loinc,
      points,
    });
  }

  return result.sort((a, b) => a.label.localeCompare(b.label));
}

export function getBloodPressureSeries(map: Map<string, VitalDataPoint[]>): {
  systolic: VitalDataPoint[];
  diastolic: VitalDataPoint[];
} {
  return {
    systolic: map.get("8480-6") ?? [],
    diastolic: map.get("8462-4") ?? [],
  };
}

export function formatConditionName(condition: FhirCondition): string {
  const coding = condition.code?.coding?.[0];
  return coding?.display ?? coding?.code ?? "Unknown condition";
}

export function formatConditionOnset(condition: FhirCondition): string {
  const date = condition.onsetDateTime ?? condition.onsetPeriod?.start;
  return date ? date.slice(0, 10) : "—";
}

export function formatMedicationName(med: FhirMedicationRequest): string {
  const concept = med.medicationCodeableConcept;
  const coding = concept?.coding?.[0];
  return coding?.display ?? coding?.code ?? med.medicationReference?.reference ?? "Unknown medication";
}

export function formatMedicationStatus(med: FhirMedicationRequest): string {
  if (!med.status) return "—";
  return med.status.charAt(0).toUpperCase() + med.status.slice(1);
}

export function formatPractitionerName(practitioner: {
  name?: Array<{ given?: string[]; family?: string; prefix?: string[] }>;
}): string {
  const name = practitioner.name?.[0];
  if (!name) return "—";
  const parts = [...(name.prefix ?? []), ...(name.given ?? []), name.family ?? ""].filter(Boolean);
  return parts.join(" ") || "—";
}
