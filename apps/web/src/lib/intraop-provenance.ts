/**
 * The provenance that travels with a recorded drug, infusion or fluid.
 *
 * Six fields, repeated verbatim at every point the timetable emits a log event.
 * They say which clinical rule and which preset produced a dose, which is what
 * makes a recorded number auditable afterwards rather than a bare figure — and
 * spelling them out by hand at seven call sites is how one of them eventually
 * gets left out of a new site and quietly stops being recorded.
 *
 * Generic over the source rather than declaring its own field types. The six
 * are not identically typed everywhere — `clinicalPresetVersion` is a number on
 * a fluid and the shapes differ elsewhere too — so restating them here would
 * either be wrong or force casts at the call sites, which is how a refactor
 * meant to protect these fields ends up hiding a mismatch in them.
 */
const PROVENANCE_KEYS = [
  "clinicalRuleKey",
  "clinicalRuleVersion",
  "clinicalRuleSourceIds",
  "clinicalPresetId",
  "clinicalPresetVersion",
  "clinicalPresetScope",
] as const

export type ProvenanceKey = (typeof PROVENANCE_KEYS)[number]

export function clinicalProvenance<T extends Partial<Record<ProvenanceKey, unknown>>>(
  source: T,
): Pick<T, Extract<keyof T, ProvenanceKey>> {
  const out = {} as Record<string, unknown>
  for (const key of PROVENANCE_KEYS) {
    // Copied whether or not it is set, so an event carries an explicit
    // `undefined` rather than omitting the key. A missing key and an undefined
    // one read the same to a consumer, but only one survives a JSON round trip
    // as the same shape.
    out[key] = source[key]
  }
  return out as Pick<T, Extract<keyof T, ProvenanceKey>>
}
