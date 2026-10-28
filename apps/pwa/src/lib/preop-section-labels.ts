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
    // After the assessment, the plan and what is ordered (10.0.0).
    { key: "risk", label: tc("pillRisk") },
    { key: "planned", label: tc("pillPlanned") },
    { key: "premedication", label: tc("pillPremedication") },
    { key: "fasting", label: tc("pillFasting") },
    { key: "wardOrders", label: tc("pillWardOrders") },
    { key: "medInstructions", label: tc("pillMedInstructions") },
  ]
}
