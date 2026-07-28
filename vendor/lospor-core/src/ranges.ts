export type ClinicalRange = {
  min: number
  max: number
  step: number
  unit: string
  precision?: number
}

/**
 * The values a picker is allowed to offer.
 *
 * Every range here must sit **inside** the API's accepted bounds (preopSchema /
 * postopSchema in lospor-app/src/lib/schemas/case.ts). A picker that offers a
 * value the API refuses is not a cosmetic mismatch: the save is rejected, and
 * before the create path was made lenient it took the whole assessment with it.
 *
 * That is not hypothetical — four of these were out of line and shipped:
 * systolic offered from 1 while the API required 40, diastolic from 1 against
 * 20, heart rate from 1 against 10, and temperature from 0 against 25. Dragging
 * a slider to the bottom was enough to trigger it.
 *
 * The agreement is now asserted rather than described:
 * lospor-app/src/__tests__/range-schema-agreement.test.ts feeds every min and
 * max below through the real schema and fails if either side drifts.
 */
export const CLINICAL_RANGES = {
  AGE_RANGE:              { min: 0, max: 149, step: 1,   unit: "years" },
  HEIGHT_RANGE:           { min: 30, max: 250, step: 1,  unit: "cm" },
  // Step 0.5, not 1: with a non-integer minimum (0.5) a step of 1 puts the
  // valid grid on the half-kilos (…104.5, 105.5) and rejects every whole
  // number — which is the most common weight there is. 0.5 accepts both whole
  // and half kilos, and matches the granularity the phone wheel already uses.
  WEIGHT_RANGE:           { min: 0.5, max: 250, step: 0.5, unit: "kg" },
  // Floors are the API's, not zero: an unrecordable pressure is "unable to
  // obtain", not a systolic of 1.
  BP_SYSTOLIC_RANGE:      { min: 40, max: 300, step: 1,  unit: "mmHg" },
  BP_DIASTOLIC_RANGE:     { min: 20, max: 200, step: 1,  unit: "mmHg" },
  HEART_RATE_RANGE:       { min: 10, max: 300, step: 1,  unit: "bpm" },
  SPO2_RANGE:             { min: 0, max: 100, step: 1,   unit: "%" },
  // 25 °C is the API floor for a recorded temperature. Deep hypothermia is
  // charted intraoperatively as an event, which is a different path.
  TEMPERATURE_RANGE:      { min: 25, max: 45, step: 0.1, unit: "°C", precision: 1 },
  RESPIRATORY_RATE_RANGE: { min: 0, max: 50,  step: 1,   unit: "/min" },
  MOUTH_OPENING_RANGE:    { min: 0, max: 10,  step: 0.5, unit: "cm", precision: 1 },
  THYROMENTAL_RANGE:      { min: 0, max: 15,  step: 1,   unit: "cm" },
  ALDRETE_SUBSCORE_RANGE: { min: 0, max: 2,   step: 1,   unit: "" },
  PAIN_NRS_RANGE:         { min: 0, max: 10,  step: 1,   unit: "" },
} satisfies Record<string, ClinicalRange>

export type ClinicalRangeKey = keyof typeof CLINICAL_RANGES

export function isClinicalNumberFilled(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value)
}

export function validateClinicalNumber(key: ClinicalRangeKey, value: unknown): boolean {
  if (!isClinicalNumberFilled(value)) return false
  const range = CLINICAL_RANGES[key]
  const numericValue = value as number
  return numericValue >= range.min && numericValue <= range.max
}
