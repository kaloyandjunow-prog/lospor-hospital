import type { TimetableData } from "@/components/IntraopTimetable"

// Bolus drugs are point-in-time entries (no extend/resume/continue
// lifecycle like infusions/fluids/agents have), so this stays small —
// removeDrug is the only thing actually wired to a UI action. Mirrors
// mobile's useDrugEntry in shape (one hook per domain), even though the
// two apps' drug-entry UI differs (web: inline pill + popover via openFP;
// mobile: a dedicated Sheet).
export function useDrugHandlers(data: TimetableData, onChange: (d: TimetableData) => void) {
  function removeDrug(idx: number) {
    onChange({ ...data, drugs: data.drugs.filter((_, i) => i !== idx) })
  }

  return { removeDrug }
}
