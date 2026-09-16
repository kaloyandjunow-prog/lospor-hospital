/**
 * A planned procedure: the group a clinician chose, and optionally the exact
 * operation inside it.
 *
 * LOSPOR's procedure list is the 330 PRCCSR groups over ICD-10-PCS. Choosing a
 * group used to store the best-matching example code beside it, and that code
 * was nearly always the group's first: every cholecystectomy was saved as
 * 0FB40ZZ, an open *partial* excision, whatever was actually done. So a group
 * now stands on its own, under its own system, and an ICD-10-PCS code is
 * stored only when the clinician picks the exact operation. ICD-10-PCS is a
 * standard OMOP procedure vocabulary, so that code is also the research code.
 */

import type { ProcedureSearchRow } from "./search"

/** The system of a tag that names a LOSPOR procedure group and nothing finer. */
export const PROCEDURE_GROUP_SYSTEM = "LOSPOR_PROCEDURE_GROUP"

/** The system of a tag carrying an exact ICD-10-PCS code. */
export const ICD10PCS_SYSTEM = "ICD-10-PCS"

/** Seven characters from ICD-10-PCS's alphabet, which leaves out I and O. */
export function isIcd10PcsCode(code: unknown): code is string {
  return typeof code === "string" && /^[0-9A-HJ-NP-Z]{7}$/.test(code)
}

export type ProcedureTag = {
  label: string
  code: string
  system: string
  group: string
  domain?: string
  /** The ICD-10-PCS description, only on an exact operation. */
  description?: string
  sub?: string
}

/** A group chosen from the procedure search, with no operation implied. */
export function procedureGroupTag(row: Pick<ProcedureSearchRow, "group" | "domain">): ProcedureTag {
  return {
    label: row.group,
    code: row.group,
    system: PROCEDURE_GROUP_SYSTEM,
    group: row.group,
    ...(row.domain ? { domain: row.domain, sub: row.domain } : {}),
  }
}

/** The exact operation, keeping the group it was chosen from as the label. */
export function exactProcedureTag(row: Pick<ProcedureSearchRow, "code" | "group" | "domain" | "description">): ProcedureTag {
  return {
    label: row.group,
    code: row.code,
    system: ICD10PCS_SYSTEM,
    group: row.group,
    ...(row.domain ? { domain: row.domain } : {}),
    description: row.description,
    sub: `${row.code} · ${row.description}`,
  }
}

/** Whether a stored procedure carries a chosen ICD-10-PCS operation. */
export function isExactProcedure(tag: { system?: unknown; code?: unknown; [key: string]: unknown } | null | undefined): boolean {
  return tag?.system === ICD10PCS_SYSTEM && isIcd10PcsCode(tag.code)
}

/**
 * The group a stored procedure belongs to, for any shape it was saved in: the
 * explicit field, or the label every earlier tag carried the group in.
 */
export function procedureGroupOf(tag: { group?: unknown; label?: unknown; [key: string]: unknown } | null | undefined): string | null {
  const group = typeof tag?.group === "string" && tag.group.trim() ? tag.group.trim() : null
  if (group) return group
  return typeof tag?.label === "string" && tag.label.trim() ? tag.label.trim() : null
}

/**
 * Clinicians' words for an ICD-10-PCS approach. The classification says
 * "percutaneous endoscopic" for every laparoscopic, thoracoscopic and
 * arthroscopic operation, so a clinician typing the word they use found
 * nothing.
 */
const APPROACH_WORDS: readonly [RegExp, string][] = [
  [/^(lap|vats)$|^(laparoscop|thoracoscop|arthroscop|лапароскоп|торакоскоп|артроскоп)/, "percutaneous endoscopic"],
  [/^(endoscop|ендоскоп)/, "endoscopic"],
  [/^(open|отворен|laparotom|thoracotom|лапаротом|торакотом)/, "open"],
  [/^(percutaneous|перкутан)/, "percutaneous"],
]

/** The query words, with a clinician's approach word read as ICD-10-PCS says it. */
export function procedureQueryWords(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    .map(word => APPROACH_WORDS.find(([pattern]) => pattern.test(word))?.[1] ?? word)
}

export type ProcedureCodeRow = { code: string; description: string; suggested?: true }

/**
 * The operations inside one group, narrowed by the words typed.
 *
 * Every word must appear in the description or start the code, so "lap
 * resection" narrows rather than widens. Ordered by code, which in ICD-10-PCS
 * keeps one body part and one operation together -- except that operations a
 * hospital code crosswalked to come first, marked, because they are the likely
 * answer for an imported procedure.
 */
export function filterProcedureCodes(
  rows: readonly ProcedureSearchRow[],
  group: string,
  query = "",
  suggested: readonly string[] = [],
): ProcedureCodeRow[] {
  const words = procedureQueryWords(query)
  const wanted = group.trim().toLowerCase()
  const likely = new Set(suggested)
  return rows
    .filter(row => row.group.trim().toLowerCase() === wanted)
    .filter(row => {
      const description = row.description.toLowerCase()
      const code = row.code.toLowerCase()
      return words.every(word => description.includes(word) || code.startsWith(word))
    })
    .map(row => ({ code: row.code, description: row.description, ...(likely.has(row.code) ? { suggested: true as const } : {}) }))
    .sort((a, b) => Number(!!b.suggested) - Number(!!a.suggested) || a.code.localeCompare(b.code))
}

/** What a hospital sent for a procedure, kept when the clinician refines it. */
export type ImportedProcedure = {
  code: string
  system?: string
  sourceVocabulary?: string
  sourceLabel?: string
  suggestedCodes?: string[]
}

type StoredProcedure = { [key: string]: unknown }

const optional = (value: unknown) => typeof value === "string" && value.trim() ? value : undefined

/**
 * The hospital's own coding of an imported procedure, if this is one.
 *
 * Choosing the exact operation replaces the tag, and without this the КСМП
 * code and the hospital's wording went with it: the record kept LOSPOR's
 * answer and lost the question it answered.
 */
export function importedProcedureOf(tag: StoredProcedure | null | undefined): ImportedProcedure | undefined {
  if (!tag) return undefined
  const kept = tag.imported
  if (kept && typeof kept === "object" && optional((kept as StoredProcedure).code)) return kept as ImportedProcedure
  if (tag.source !== "import" || tag.system === PROCEDURE_GROUP_SYSTEM) return undefined
  const code = optional(tag.code)
  if (!code) return undefined
  const suggestedCodes = Array.isArray(tag.suggestedCodes)
    ? tag.suggestedCodes.filter(isIcd10PcsCode)
    : []
  const system = optional(tag.system)
  const sourceVocabulary = optional(tag.sourceVocabulary)
  const sourceLabel = optional(tag.sourceLabel)
  return {
    code,
    ...(system ? { system } : {}),
    ...(sourceVocabulary ? { sourceVocabulary } : {}),
    ...(sourceLabel ? { sourceLabel } : {}),
    ...(suggestedCodes.length ? { suggestedCodes } : {}),
  }
}

/** The operations to offer first for a stored procedure. */
export function suggestedProcedureCodes(tag: StoredProcedure | null | undefined): string[] {
  return importedProcedureOf(tag)?.suggestedCodes ?? []
}

/**
 * A stored procedure refined to the operation picked, keeping who recorded it
 * and what the hospital sent. Shared by the web and mobile pickers so both
 * store the same tag for the same tap.
 */
export function chooseExactOperation(
  tag: StoredProcedure,
  row: Pick<ProcedureSearchRow, "code" | "group" | "domain" | "description">,
): ProcedureTag & { imported?: ImportedProcedure; source?: unknown } {
  const imported = importedProcedureOf(tag)
  return {
    ...exactProcedureTag(row),
    ...(imported ? { imported } : {}),
    ...(tag.source ? { source: tag.source } : {}),
  }
}

/**
 * Back to the group alone: the hospital's coding when there was one, as it
 * arrived, or the group under LOSPOR's group vocabulary.
 */
export function backToProcedureGroup(tag: StoredProcedure): Record<string, unknown> {
  const group = procedureGroupOf(tag) ?? ""
  const domain = optional(tag.domain) ?? ""
  const imported = importedProcedureOf(tag)
  const source = tag.source ? { source: tag.source } : {}
  if (!imported) return { ...procedureGroupTag({ group, domain }), ...source }
  return { label: group, group, ...(domain ? { domain } : {}), ...imported, ...source }
}

/**
 * How a planned procedure reads on the record and the printed sheet.
 *
 * An exact operation shows what is actually planned, not only its group:
 * "Cholecystectomy: Resection of Gallbladder, Percutaneous Endoscopic Approach
 * [0FT44ZZ]". Anything else reads as its label, as it always has.
 */
export function procedureDisplayText(tag: { label?: unknown; [key: string]: unknown } | null | undefined): string {
  if (!tag) return ""
  const label = typeof tag.label === "string" ? tag.label.trim() : ""
  if (!isExactProcedure(tag) || typeof tag.description !== "string" || !tag.description.trim()) return label
  const group = procedureGroupOf(tag) ?? label
  return `${group}: ${tag.description.trim()} [${String(tag.code)}]`
}

/** The planned-procedure line for a list of procedures, "; "-separated. */
export function plannedProcedureText(items: unknown): string {
  if (!Array.isArray(items)) return ""
  return items
    .map(item => item && typeof item === "object" ? procedureDisplayText(item as Record<string, unknown>) : "")
    .filter(Boolean)
    .join("; ")
}
