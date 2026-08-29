import type { BlockedSaveIssue } from "@lospor/core/sync"
import type { ClinicalStringKey } from "@/i18n/clinical-strings"

/**
 * Clinician-facing copy for a save the server refused and a retry cannot fix.
 *
 * Two kinds arrive here and they must not be confused. PII refusals name a
 * field that carries identifying information. Age and mode refusals are
 * blockers too, but nothing about them is identifying -- routing them through
 * the PII wording tells a clinician that the patient's age contains personal
 * data, which is both wrong and alarming.
 *
 * Lives outside the case screen so both kinds stay side by side and visibly
 * distinct, rather than as one more branch inside an already large component.
 */
const DOMAIN_COPY: Record<string, ClinicalStringKey> = {
  PEDIATRIC_MODE_REQUIRED: "blockedPediatricModeRequired",
  ADULT_MODE_REQUIRED: "blockedAdultModeRequired",
  PEDIATRIC_AGE_REQUIRED: "blockedPediatricAgeRequired",
  INVALID_PEDIATRIC_AGE: "blockedInvalidPediatricAge",
}

const FIELD_LABEL: Record<string, ClinicalStringKey> = {
  diagnosis: "diagnosisLabel",
  diagnoses: "diagnosisLabel",
  plannedProcedure: "procedureLabel",
  procedures: "procedureLabel",
  comorbidities: "activeComorbidities",
  teamNotes: "teamNotesLabel",
  allergyDetails: "allergenSearch",
  currentMedications: "medicationSearch",
  familyAnesthesiaDetails: "familyAnesthesiaDetails",
  difficultAirwayNotes: "difficultAirwayNotes",
  physicalExamReport: "physicalExamReport",
}

const PII_COPY: Record<string, ClinicalStringKey> = {
  likely_name: "piiLikelyName",
  egn: "piiEgn",
  long_number: "piiLongNumber",
  date: "piiDate",
  email: "piiEmail",
}

/** `translate` is the screen's clinical translator, passed in so this stays pure. */
export function blockedSaveMessage(
  issue: BlockedSaveIssue,
  translate: (key: ClinicalStringKey) => string,
): string {
  const domain = DOMAIN_COPY[issue.code]
  if (domain) return translate(domain)

  const labelKey = FIELD_LABEL[issue.field]
  const field = labelKey ? translate(labelKey) : issue.field
  return translate(PII_COPY[issue.reason] ?? "piiGeneric").replace("{field}", field)
}
