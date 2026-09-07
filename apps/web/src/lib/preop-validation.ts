import { evaluatePreopReadiness } from "@lospor/core/clinical-validation"

import type { PreopData } from "@/components/forms/preopSchema"

/**
 * Which required preoperative fields are still missing.
 *
 * What a preoperative assessment must contain is one clinical rule and lives in
 * core, shared with mobile. This app's part is two things core cannot know:
 * the unobtainable markers, which are live form state rather than saved record
 * fields, and the field names this form's own error display uses.
 *
 * `vitalsUTO` and `airwayUTO` are those markers. A vital somebody documented as
 * unobtainable is answered, not missing -- that distinction is the whole reason
 * the markers exist, and dropping it would demand a number nobody can produce.
 */

/** Core names the field it is unhappy about; the form knows it by another name. */
const FORM_FIELD: Readonly<Record<string, string>> = {
  bpSystolic: "bp",
  mallampati: "airway",
}

export function missingPreopFields(
  data: PreopData,
  vitalsUTO: Set<string>,
  airwayUTO: boolean,
): string[] {
  const readiness = evaluatePreopReadiness({
    ...data,
    bpUnobtainable: vitalsUTO.has("bp"),
    heartRateUnobtainable: vitalsUTO.has("heartRate"),
    respiratoryRateUnobtainable: vitalsUTO.has("respiratoryRate"),
    airwayUnobtainable: airwayUTO,
  })
  return readiness.issues.flatMap(item => {
    const field = item.path[item.path.length - 1]
    return field ? [FORM_FIELD[field] ?? field] : []
  })
}
