/**
 * Reads the five Aldrete components off a server postop record, for the form
 * that reopens an existing case.
 *
 * A missing component must stay missing. Zero is a real, pathological Aldrete
 * score on every one of these axes -- no movement, apnoeic, circulatory
 * collapse, unresponsive, critically desaturated -- so defaulting it to 0
 * turns "nobody has assessed this yet" into a documented finding, one that
 * autosave can then persist unchanged and the finalization readiness gate will
 * happily accept as complete.
 *
 * `activityScore`/`respirationScore`/etc. are the legacy column names this
 * also reads, for records written before the canonical `aldrete*` names.
 */
export type ServerAldreteRecord = {
  aldreteActivity?: number | null
  activityScore?: number | null
  aldreteRespiration?: number | null
  respirationScore?: number | null
  aldreteCirculation?: number | null
  circulationScore?: number | null
  aldreteConsciousness?: number | null
  consciousnessScore?: number | null
  aldreteSpO2?: number | null
  spO2Score?: number | null
}

export type AldreteFormValues = {
  aldreteActivity: number | undefined
  aldreteRespiration: number | undefined
  aldreteCirculation: number | undefined
  aldreteConsciousness: number | undefined
  aldreteSpO2: number | undefined
}

export function aldreteFromServerPostop(p: ServerAldreteRecord): AldreteFormValues {
  return {
    aldreteActivity:      p.aldreteActivity      ?? p.activityScore      ?? undefined,
    aldreteRespiration:   p.aldreteRespiration   ?? p.respirationScore   ?? undefined,
    aldreteCirculation:   p.aldreteCirculation   ?? p.circulationScore   ?? undefined,
    aldreteConsciousness: p.aldreteConsciousness ?? p.consciousnessScore ?? undefined,
    aldreteSpO2:          p.aldreteSpO2          ?? p.spO2Score          ?? undefined,
  }
}
