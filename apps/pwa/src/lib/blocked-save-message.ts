import {
  classifyBlockedSave,
  type BlockedSaveDomainCode,
  type BlockedSaveFieldLabel,
  type BlockedSavePiiReason,
} from "@lospor/core/blocked-save-copy"
import type { BlockedSaveIssue } from "@lospor/core/sync"
import type { ClinicalStringKey } from "@/i18n/clinical-strings"

/**
 * This app's words for a save the server refused and a retry cannot fix.
 *
 * Which kind of refusal it is, and which field it names, is decided in core so
 * that every client answers alike. What is left here is this app's clinical
 * string keys. The tables are exhaustive by type: a label added in core fails
 * the build here until it has copy -- which is what the preoperative notes
 * field lacked while web carried one.
 */

const DOMAIN_COPY: Record<BlockedSaveDomainCode, ClinicalStringKey> = {
  PEDIATRIC_MODE_REQUIRED: "blockedPediatricModeRequired",
  ADULT_MODE_REQUIRED: "blockedAdultModeRequired",
  PEDIATRIC_AGE_REQUIRED: "blockedPediatricAgeRequired",
  INVALID_PEDIATRIC_AGE: "blockedInvalidPediatricAge",
}

const FIELD_LABEL: Record<BlockedSaveFieldLabel, ClinicalStringKey> = {
  diagnosis: "diagnosisLabel",
  procedure: "procedureLabel",
  comorbidities: "activeComorbidities",
  teamNotes: "teamNotesLabel",
  allergies: "allergenSearch",
  medications: "medicationSearch",
  familyAnesthesia: "familyAnesthesiaDetails",
  difficultAirwayNotes: "difficultAirwayNotes",
  physicalExamReport: "physicalExamReport",
  notes: "notesLabel",
}

const PII_COPY: Record<BlockedSavePiiReason, ClinicalStringKey> = {
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
  const copy = classifyBlockedSave(issue)
  if (copy.kind === "domain") return translate(DOMAIN_COPY[copy.code])

  const field = copy.label ? translate(FIELD_LABEL[copy.label]) : copy.field
  return translate(copy.reason ? PII_COPY[copy.reason] : "piiGeneric").replace("{field}", field)
}
