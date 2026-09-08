/**
 * What a recorded dose remembers about where its number came from.
 *
 * Six fields naming the clinical rule and the preset that produced a dose. They
 * are what makes a figure in the record auditable afterwards rather than a bare
 * number somebody typed — "40 mg" against "40 mg, from the adult propofol rule,
 * institution preset v3".
 *
 * Here rather than in either app because both write them and both were spelling
 * them out by hand: nine call sites across the web and mobile timetables, plus
 * five more inside this package. A seventh field added to that arrangement gets
 * carried at eight sites and forgotten at the ninth, and the loss is silent —
 * the dose still records, it just stops saying where it came from.
 *
 * Two directions, because there are genuinely two moments:
 *
 *   - **Minting**, when a clinician records a dose the rule engine sized. The
 *     rule is in hand and its fields are named for a rule, not for an event.
 *   - **Carrying**, when an existing entry is duplicated onto another column or
 *     turned into a log event. The provenance already exists and must travel
 *     unchanged rather than being re-derived, because the rule that applied then
 *     is the fact being recorded, not whichever rule applies now.
 */

export type ClinicalPresetScope = "PLATFORM" | "INSTITUTION" | "USER"

export type ClinicalProvenance = {
  clinicalRuleKey?: string
  clinicalRuleVersion?: string
  clinicalRuleSourceIds?: string[]
  clinicalPresetId?: string
  clinicalPresetVersion?: number
  clinicalPresetScope?: ClinicalPresetScope
}

/** The rule engine's own naming, as both apps receive it. */
export type ClinicalRuleSource = {
  key?: string
  version?: string
  sourceIds?: string[]
  presetId?: string
  presetVersion?: number
  presetScope?: ClinicalPresetScope
}

export const CLINICAL_PROVENANCE_KEYS = [
  "clinicalRuleKey",
  "clinicalRuleVersion",
  "clinicalRuleSourceIds",
  "clinicalPresetId",
  "clinicalPresetVersion",
  "clinicalPresetScope",
] as const

/**
 * Provenance for a dose the rule engine just sized.
 *
 * A partial preset is dropped rather than half-recorded: an id with no version
 * cannot be resolved back to what was actually applied, and a preset reference
 * that cannot be resolved is worse than none, because it looks like an answer.
 * The rule fields stand on their own and are kept whatever the preset does.
 */
export function provenanceFromRule(rule: ClinicalRuleSource | null | undefined): ClinicalProvenance {
  if (!rule) return {}

  const presetComplete = rule.presetId !== undefined
    && rule.presetVersion !== undefined
    && rule.presetScope !== undefined

  return {
    clinicalRuleKey: rule.key,
    clinicalRuleVersion: rule.version,
    clinicalRuleSourceIds: rule.sourceIds,
    ...(presetComplete
      ? {
          clinicalPresetId: rule.presetId,
          clinicalPresetVersion: rule.presetVersion,
          clinicalPresetScope: rule.presetScope,
        }
      : {}),
  }
}

/**
 * Provenance carried from an entry that already has it.
 *
 * Every key is copied whether or not it is set, so the result has the same
 * shape each time. A missing key and a key set to undefined read alike in
 * memory and differently through JSON, and these travel through JSON.
 *
 * Generic over the source so an entry keeps its own field types — the preset
 * version is a number on a fluid and the shapes differ elsewhere — rather than
 * being widened to this module's view of them.
 */
export function carryProvenance<T extends Partial<Record<
  (typeof CLINICAL_PROVENANCE_KEYS)[number], unknown
>>>(source: T): Pick<T, Extract<keyof T, (typeof CLINICAL_PROVENANCE_KEYS)[number]>> {
  const out = {} as Record<string, unknown>
  for (const key of CLINICAL_PROVENANCE_KEYS) out[key] = source[key]
  return out as Pick<T, Extract<keyof T, (typeof CLINICAL_PROVENANCE_KEYS)[number]>>
}

/** Whether anything is actually recorded — an all-undefined set is not provenance. */
export function hasProvenance(provenance: ClinicalProvenance): boolean {
  return CLINICAL_PROVENANCE_KEYS.some(key => provenance[key] !== undefined)
}
