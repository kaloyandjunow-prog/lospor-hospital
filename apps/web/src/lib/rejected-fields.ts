import { CLINICAL_RANGES, type ClinicalRangeKey } from "@lospor/core"

/**
 * Turning "the server refused this value" into something the clinician can act
 * on, at the field they typed it into.
 *
 * The API has reported `rejectedFields` since v5.2.1, but the web client never
 * read it — so a refused value was dropped in silence and the form went on
 * looking saved. All that appeared was a generic "autosave failed" line in the
 * header, naming nothing.
 *
 * Everything here is deliberately total: unknown paths, malformed payloads and
 * junk all degrade to "no message" rather than throwing. A notifier that can
 * break the form it is reporting on is worse than no notifier — a clinician
 * must never be blocked from charting because we could not phrase an error.
 */

export type RejectedField = { path: string; message?: string }

/** Which clinical range governs a given form field, where one does. */
const RANGE_FOR_FIELD: Record<string, ClinicalRangeKey> = {
  ageYears:            "AGE_RANGE",
  heightCm:            "HEIGHT_RANGE",
  weightKg:            "WEIGHT_RANGE",
  bpSystolic:          "BP_SYSTOLIC_RANGE",
  bpDiastolic:         "BP_DIASTOLIC_RANGE",
  heartRate:           "HEART_RATE_RANGE",
  spO2:                "SPO2_RANGE",
  temperature:         "TEMPERATURE_RANGE",
  respiratoryRate:     "RESPIRATORY_RATE_RANGE",
  mouthOpeningCm:      "MOUTH_OPENING_RANGE",
  thyromental:         "THYROMENTAL_RANGE",
  recoveryBpSystolic:  "BP_SYSTOLIC_RANGE",
  recoveryBpDiastolic: "BP_DIASTOLIC_RANGE",
  recoveryHeartRate:   "HEART_RATE_RANGE",
  recoverySpO2:        "SPO2_RANGE",
  temperatureCelsius:  "TEMPERATURE_RANGE",
  painScoreNRS:        "PAIN_NRS_RANGE",
}

/** Anything shaped like a rejection list, from any response, safely. */
export function readRejectedFields(body: unknown): RejectedField[] {
  if (!body || typeof body !== "object") return []
  const raw = (body as { rejectedFields?: unknown }).rejectedFields
  if (!Array.isArray(raw)) return []
  return raw.flatMap(entry => {
    if (!entry || typeof entry !== "object") return []
    const path = (entry as { path?: unknown }).path
    if (typeof path !== "string" || !path) return []
    const message = (entry as { message?: unknown }).message
    return [{ path, message: typeof message === "string" ? message : undefined }]
  })
}

/**
 * The bare field name a path refers to: "preop.heightCm" -> "heightCm".
 * PATCH sends section-prefixed paths and POST now matches, but a bare path is
 * still handled so an older server cannot break the client.
 */
export function fieldKeyOf(path: string): string {
  const parts = path.split(".")
  return parts[parts.length - 1] || path
}

/** Field keys to flag on the form — feeds the same red ring as required-field errors. */
export function rejectedFieldKeys(rejected: RejectedField[]): Set<string> {
  return new Set(rejected.map(r => fieldKeyOf(r.path)))
}

/** Only the rejections belonging to one section, by prefix. */
export function rejectionsForSection(
  rejected: RejectedField[],
  section: "preop" | "intraop" | "postop",
): RejectedField[] {
  return rejected.filter(r => !r.path.includes(".") || r.path.startsWith(`${section}.`))
}

/**
 * What to show beside the field.
 *
 * States the accepted bounds where we know them — "Not saved — must be 30–250 cm"
 * tells the clinician what to do, where "Invalid request" does not. Falls back
 * to the server's own message, then to a plain statement, so there is always
 * something to show.
 */
export function describeRejection(
  path: string,
  serverMessage?: string,
  notSavedLabel = "Not saved",
): string {
  const key = fieldKeyOf(path)
  const rangeKey = RANGE_FOR_FIELD[key]
  if (rangeKey) {
    const r = CLINICAL_RANGES[rangeKey]
    const unit = r.unit ? ` ${r.unit}` : ""
    return `${notSavedLabel} — must be ${r.min}–${r.max}${unit}`
  }
  return serverMessage ? `${notSavedLabel} — ${serverMessage}` : `${notSavedLabel} — value not accepted`
}

/** Per-field messages, keyed by field name, ready to render inline. */
export function rejectionMessages(
  rejected: RejectedField[],
  notSavedLabel?: string,
): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of rejected) {
    const key = fieldKeyOf(r.path)
    if (!out.has(key)) out.set(key, describeRejection(r.path, r.message, notSavedLabel))
  }
  return out
}
