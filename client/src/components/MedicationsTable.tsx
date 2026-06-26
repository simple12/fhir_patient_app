import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMedicationName, formatMedicationStatus } from "@/lib/fhir-clinical";
import type { FhirMedicationRequest } from "@/types/fhir";

type MedicationsTableProps = {
  medications: FhirMedicationRequest[];
};

export function MedicationsTable({ medications }: MedicationsTableProps) {
  if (medications.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No medications recorded.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Medication</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {medications.map((m) => (
            <TableRow key={m.id ?? formatMedicationName(m)}>
              <TableCell>{formatMedicationName(m)}</TableCell>
              <TableCell>{formatMedicationStatus(m)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
