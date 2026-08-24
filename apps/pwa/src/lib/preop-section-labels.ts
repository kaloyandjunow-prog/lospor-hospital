import type { ClinicalStringKey } from "@/lib/preferences-context"
import type { PreopSectionLabel } from "@/lib/preop-section-overview"

export function localizedPreopSectionLabels(
  tc: (key: ClinicalStringKey) => string,
): PreopSectionLabel[] {
  return [
    { key: "patient", label: tc("pillPatient") },
    { key: "case", label: tc("sectionCaseDetails") },
    { key: "history", label: tc("sectionHistory") },
    { key: "meds", label: tc("sectionMeds") },
    { key: "anamnesis", label: tc("pillAnamnesis") },
    { key: "exam", label: tc("sectionExam") },
    { key: "airway", label: tc("pillAirway") },
    { key: "labs", label: tc("pillLabs") },
    { key: "risk", label: tc("pillRisk") },
  ]
}
