import type { BlockedSaveIssue } from "./sync/protocol"

/**
 * Which kind of refusal a blocked save is, and which field it names.
 *
 * Two kinds arrive here and they must not be confused. PII refusals name a
 * field carrying identifying information. Age and mode refusals are blockers
 * too, but nothing about them is identifying -- routing them through the PII
 * wording tells a clinician that the patient's age contains personal data,
 * which is both wrong and alarming.
 *
 * The decision lives here because it is the same decision on every client. The
 * words do not: each app names its own copy in its own catalogue, so this
 * returns what to say about, and the caller supplies the saying. What that buys
 * is a compiler error rather than a silent gap -- a client whose table misses a
 * label added here will not build, which is how the two apps came to disagree
 * about the preoperative notes field while both looked correct.
 */

export const BLOCKED_SAVE_DOMAIN_CODES = [
  "PEDIATRIC_MODE_REQUIRED",
  "ADULT_MODE_REQUIRED",
  "PEDIATRIC_AGE_REQUIRED",
  "INVALID_PEDIATRIC_AGE",
] as const

export type BlockedSaveDomainCode = typeof BLOCKED_SAVE_DOMAIN_CODES[number]

export const BLOCKED_SAVE_PII_REASONS = [
  "likely_name",
  "egn",
  "long_number",
  "date",
  "email",
] as const

export type BlockedSavePiiReason = typeof BLOCKED_SAVE_PII_REASONS[number]

/**
 * The free-text fields a PII refusal can name. Anything else the server refuses
 * is reported by its wire name rather than guessed at -- a field nobody has
 * written copy for is better shown raw than shown as the wrong field.
 */
export const BLOCKED_SAVE_FIELD_LABELS = [
  "diagnosis",
  "procedure",
  "comorbidities",
  "teamNotes",
  "allergies",
  "medications",
  "familyAnesthesia",
  "difficultAirwayNotes",
  "physicalExamReport",
  "notes",
] as const

export type BlockedSaveFieldLabel = typeof BLOCKED_SAVE_FIELD_LABELS[number]

const DOMAIN_CODES = new Set<string>(BLOCKED_SAVE_DOMAIN_CODES)
const PII_REASONS = new Set<string>(BLOCKED_SAVE_PII_REASONS)

/** Several wire names reach the clinician as one field, so they share a label. */
const FIELD_LABEL: Readonly<Record<string, BlockedSaveFieldLabel>> = {
  diagnosis: "diagnosis",
  diagnoses: "diagnosis",
  plannedProcedure: "procedure",
  procedures: "procedure",
  comorbidities: "comorbidities",
  teamNotes: "teamNotes",
  allergyDetails: "allergies",
  currentMedications: "medications",
  familyAnesthesiaDetails: "familyAnesthesia",
  difficultAirwayNotes: "difficultAirwayNotes",
  physicalExamReport: "physicalExamReport",
  notes: "notes",
}

export type BlockedSaveCopy =
  | { kind: "domain"; code: BlockedSaveDomainCode }
  | {
      kind: "pii"
      /** `null` for a reason this version does not recognise: say something generic. */
      reason: BlockedSavePiiReason | null
      /** `null` when no label exists: show `field` as it came off the wire. */
      label: BlockedSaveFieldLabel | null
      field: string
    }

export function classifyBlockedSave(issue: BlockedSaveIssue): BlockedSaveCopy {
  if (DOMAIN_CODES.has(issue.code)) {
    return { kind: "domain", code: issue.code as BlockedSaveDomainCode }
  }
  return {
    kind: "pii",
    reason: PII_REASONS.has(issue.reason) ? issue.reason as BlockedSavePiiReason : null,
    label: FIELD_LABEL[issue.field] ?? null,
    field: issue.field,
  }
}
