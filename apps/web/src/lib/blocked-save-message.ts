import {
  classifyBlockedSave,
  type BlockedSaveDomainCode,
  type BlockedSaveFieldLabel,
  type BlockedSavePiiReason,
} from "@lospor/core/blocked-save-copy"
import type { BlockedSaveIssue } from "@lospor/core/sync"

/**
 * This app's words for a save the server refused and a retry cannot fix.
 *
 * Which kind of refusal it is, and which field it names, is decided in core so
 * that every client answers alike. What is left here is this catalogue's keys,
 * which are this app's own. The tables are exhaustive by type: a label added in
 * core fails the build here until it has copy.
 */

const DOMAIN_COPY: Record<BlockedSaveDomainCode, string> = {
  PEDIATRIC_MODE_REQUIRED: "pediatric.switchRequired",
  ADULT_MODE_REQUIRED: "pediatric.adultRequired",
  PEDIATRIC_AGE_REQUIRED: "pediatric.ageRequired",
  INVALID_PEDIATRIC_AGE: "pediatric.ageInvalid",
}

const FIELD_LABEL: Record<BlockedSaveFieldLabel, string> = {
  diagnosis: "preop.diagnosis",
  procedure: "preop.procedure",
  comorbidities: "preop.historySection",
  teamNotes: "preop.teamNotes",
  allergies: "preop.allergies",
  medications: "preop.medicationsSection",
  familyAnesthesia: "preop.familyAnesthesia",
  difficultAirwayNotes: "preop.difficultAirwayDetails",
  physicalExamReport: "preop.physicalExamReport",
  notes: "preop.notesLabel",
}

const PII_COPY: Record<BlockedSavePiiReason, string> = {
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
  const copy = classifyBlockedSave(issue)
  if (copy.kind === "domain") return translate(DOMAIN_COPY[copy.code])

  const field = copy.label ? translate(FIELD_LABEL[copy.label]) : copy.field
  return translate(copy.reason ? PII_COPY[copy.reason] : "case.piiGeneric", { field })
}

const PREOP_REJECTION_FIELDS = new Set([
  "diagnoses", "procedures", "comorbidities", "teamNotes",
  "allergyDetails", "currentMedications", "familyAnesthesiaDetails",
  "difficultAirwayNotes", "physicalExamReport", "preopNotes",
])

/** Folds a blocked-save refusal into the preop rejection map shown inline on that field, if it names one. */
export function withBlockedPreopRejection(
  rejections: Map<string, string>,
  blockedIssue: BlockedSaveIssue | null,
  message: (issue: BlockedSaveIssue) => string,
): Map<string, string> {
  if (!blockedIssue) return rejections
  const field =
    blockedIssue.field === "diagnosis" ? "diagnoses"
    : blockedIssue.field === "plannedProcedure" ? "procedures"
    : blockedIssue.field
  if (PREOP_REJECTION_FIELDS.has(field)) rejections.set(field, message(blockedIssue))
  return rejections
}
