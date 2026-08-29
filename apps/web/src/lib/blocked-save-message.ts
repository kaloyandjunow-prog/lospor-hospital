import type { BlockedSaveIssue } from "@lospor/core/sync"

/**
 * Clinician-facing copy for a save the server refused and a retry cannot fix.
 *
 * Two kinds arrive here and they must not be confused. PII refusals name a
 * field carrying identifying information. Age and mode refusals are blockers
 * too, but nothing about them is identifying -- routing them through the PII
 * wording tells a clinician that the patient's age contains personal data,
 * which is both wrong and alarming.
 *
 * Lives outside the case screen so both kinds stay side by side and visibly
 * distinct, rather than as one more branch inside an already large component.
 */
const DOMAIN_COPY: Record<string, string> = {
  PEDIATRIC_MODE_REQUIRED: "pediatric.switchRequired",
  ADULT_MODE_REQUIRED: "pediatric.adultRequired",
  PEDIATRIC_AGE_REQUIRED: "pediatric.ageRequired",
  INVALID_PEDIATRIC_AGE: "pediatric.ageInvalid",
}

const FIELD_LABEL: Record<string, string> = {
  diagnosis: "preop.diagnosis",
  diagnoses: "preop.diagnosis",
  plannedProcedure: "preop.procedure",
  procedures: "preop.procedure",
  comorbidities: "preop.historySection",
  teamNotes: "preop.teamNotes",
  allergyDetails: "preop.allergies",
  currentMedications: "preop.medicationsSection",
  familyAnesthesiaDetails: "preop.familyAnesthesia",
  difficultAirwayNotes: "preop.difficultAirwayDetails",
  physicalExamReport: "preop.physicalExamReport",
  notes: "preop.notesLabel",
}

const PII_COPY: Record<string, string> = {
  likely_name: "case.piiLikelyName",
  egn: "case.piiEgn",
  long_number: "case.piiLongNumber",
  date: "case.piiDate",
  email: "case.piiEmail",
}

/** `translate` is the screen's translator, passed in so this stays pure. */
export function blockedSaveMessage(
  issue: BlockedSaveIssue,
  translate: (key: string, values?: Record<string, string>) => string,
): string {
  const domain = DOMAIN_COPY[issue.code]
  if (domain) return translate(domain)

  const labelKey = FIELD_LABEL[issue.field]
  const field = labelKey ? translate(labelKey) : issue.field
  return translate(PII_COPY[issue.reason] ?? "case.piiGeneric", { field })
}
