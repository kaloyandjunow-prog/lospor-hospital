import {
  CDC_CHILD_MEDIAN_STATURE_CM,
  CDC_CHILD_MEDIAN_WEIGHT_KG,
  CDC_GROWTH_REFERENCE_VERSION,
  CDC_INFANT_MEDIAN_LENGTH_CM,
  CDC_INFANT_MEDIAN_WEIGHT_KG,
  type CdcMedianReferencePoint,
  type CdcSex,
} from "./cdc-growth-reference"
import {
  normalizePediatricAge,
  type ClinicalMode,
  type PediatricAgeInput,
} from "./pediatric"

export const DEVINE_IBW_VERSION = "DEVINE_1974" as const
export const MCLAREN_IBW_VERSION = "MCLAREN_CDC_2000" as const

/**
 * Devine's anchor: the constants are the ideal weight *at* five feet — 50 kg
 * for a man, 45.5 kg for a woman — and the formula adds 2.3 kg per inch above.
 *
 * This is the height at or above which Devine is properly defined, and the
 * point the paediatric hand-over relies on. It is not the refusal bound: see
 * DEVINE_MINIMUM_HEIGHT_CM.
 */
export const DEVINE_ANCHOR_HEIGHT_CM = 152.4

/**
 * Below the anchor the same term subtracts, so the estimate degrades with every
 * centimetre and passes through zero at roughly 102 cm (female) and 110 cm
 * (male). Devine proposed it for dosing adults and never derived it from a
 * dataset; it carries no information about short stature.
 *
 * Refusing everything under five feet would be faithful to the formula but
 * wrong in practice: adults of 145–152 cm are ordinary, the extrapolation there
 * is small, and it still yields a sensible weight (43 kg at 150 cm). Cutting
 * them off would remove dose support from a large, entirely routine group.
 *
 * The danger is further down, where the linear term runs away from reality —
 * 25 kg at 130 cm, 16 kg at 120 cm. Adult height that low is usually
 * disproportionate short stature, where trunk mass is near-normal and Devine
 * understates lean weight badly; a 63 mg induction dose of propofol is the kind
 * of number that follows. Clamping at zero, as this once did, dressed that up
 * as an answer instead of admitting the formula had run out.
 *
 * 140 cm is a judgement, not a published boundary: low enough to keep short
 * adults dosing normally, high enough that no dose is ever suggested from the
 * part of the line that has gone to pieces.
 */
export const DEVINE_MINIMUM_HEIGHT_CM = 140

export type IdealBodyWeightMethod =
  | typeof DEVINE_IBW_VERSION
  | typeof MCLAREN_IBW_VERSION

export type IdealBodyWeightUnavailableReason =
  | "MISSING_HEIGHT"
  | "INVALID_HEIGHT"
  | "MISSING_AGE"
  | "INVALID_AGE"
  | "UNSUPPORTED_SEX"
  | "OUTSIDE_REFERENCE_HEIGHT"
  | "PRETERM_REFERENCE_REQUIRED"

export type IdealBodyWeightResolution =
  | {
      available: true
      kilograms: number
      roundedKg: number
      method: IdealBodyWeightMethod
      methodVersion: string
      sourceIds: string[]
      referenceMeasurement: "STATURE" | "LENGTH"
      referenceAgeMonths?: number
    }
  | {
      available: false
      reason: IdealBodyWeightUnavailableReason
      method: IdealBodyWeightMethod
      methodVersion: string
      sourceIds: string[]
    }

function cdcSex(value: string | null | undefined): CdcSex | null {
  const normalized = value?.trim().toUpperCase()
  if (normalized === "MALE" || normalized === "M") return "MALE"
  if (normalized === "FEMALE" || normalized === "F") return "FEMALE"
  return null
}

function roundedKg(value: number): number {
  return Math.round(value * 10) / 10
}

function unavailable(
  method: IdealBodyWeightMethod,
  reason: IdealBodyWeightUnavailableReason,
): IdealBodyWeightResolution {
  return {
    available: false,
    reason,
    method,
    methodVersion: method === DEVINE_IBW_VERSION
      ? DEVINE_IBW_VERSION
      : CDC_GROWTH_REFERENCE_VERSION,
    sourceIds: method === DEVINE_IBW_VERSION
      ? [DEVINE_IBW_VERSION]
      : ["MCLAREN_IBW_1972", "CDC_GROWTH_CHARTS_2000"],
  }
}

export function calculateDevineIdealBodyWeight(input: {
  heightCm?: number | null
  sex?: string | null
}): IdealBodyWeightResolution {
  if (input.heightCm == null) return unavailable(DEVINE_IBW_VERSION, "MISSING_HEIGHT")
  if (!Number.isFinite(input.heightCm) || input.heightCm <= 0) {
    return unavailable(DEVINE_IBW_VERSION, "INVALID_HEIGHT")
  }
  const sex = cdcSex(input.sex)
  if (!sex) return unavailable(DEVINE_IBW_VERSION, "UNSUPPORTED_SEX")
  // See DEVINE_MINIMUM_HEIGHT_CM: a short adult is still dosed, but the part of
  // the line that has run away from reality reports nothing at all.
  if (input.heightCm < DEVINE_MINIMUM_HEIGHT_CM) {
    return unavailable(DEVINE_IBW_VERSION, "OUTSIDE_REFERENCE_HEIGHT")
  }
  const inches = input.heightCm / 2.54
  const kilograms = (sex === "FEMALE" ? 45.5 : 50) + 2.3 * (inches - 60)
  return {
    available: true,
    kilograms,
    roundedKg: roundedKg(kilograms),
    method: DEVINE_IBW_VERSION,
    methodVersion: DEVINE_IBW_VERSION,
    sourceIds: [DEVINE_IBW_VERSION],
    referenceMeasurement: "STATURE",
  }
}

function interpolateAgeForMeasurement(
  measurement: number,
  reference: readonly CdcMedianReferencePoint[],
): number | null {
  const first = reference[0]
  const last = reference[reference.length - 1]
  if (!first || !last || measurement < first[1] || measurement > last[1]) return null
  for (let index = 0; index < reference.length; index += 1) {
    const current = reference[index]
    if (!current) continue
    if (measurement === current[1]) return current[0]
    const next = reference[index + 1]
    if (!next || measurement > next[1]) continue
    const span = next[1] - current[1]
    if (span <= 0) return current[0]
    return current[0] + (measurement - current[1]) / span * (next[0] - current[0])
  }
  return null
}

function interpolateMedianAtAge(
  ageMonths: number,
  reference: readonly CdcMedianReferencePoint[],
): number | null {
  const first = reference[0]
  const last = reference[reference.length - 1]
  if (!first || !last || ageMonths < first[0] || ageMonths > last[0]) return null
  for (let index = 0; index < reference.length; index += 1) {
    const current = reference[index]
    if (!current) continue
    if (ageMonths === current[0]) return current[1]
    const next = reference[index + 1]
    if (!next || ageMonths > next[0]) continue
    const span = next[0] - current[0]
    if (span <= 0) return current[1]
    return current[1] + (ageMonths - current[0]) / span * (next[1] - current[1])
  }
  return null
}

export function calculateMcLarenIdealBodyWeight(input: {
  heightCm?: number | null
  sex?: string | null
  age?: PediatricAgeInput | null
  preterm?: boolean | null
}): IdealBodyWeightResolution {
  if (input.heightCm == null) return unavailable(MCLAREN_IBW_VERSION, "MISSING_HEIGHT")
  if (!Number.isFinite(input.heightCm) || input.heightCm <= 0) {
    return unavailable(MCLAREN_IBW_VERSION, "INVALID_HEIGHT")
  }
  if (!input.age) return unavailable(MCLAREN_IBW_VERSION, "MISSING_AGE")
  const age = normalizePediatricAge(input.age)
  if (!age) return unavailable(MCLAREN_IBW_VERSION, "INVALID_AGE")
  if (input.preterm === true) {
    return unavailable(MCLAREN_IBW_VERSION, "PRETERM_REFERENCE_REQUIRED")
  }
  const sex = cdcSex(input.sex)
  if (!sex) return unavailable(MCLAREN_IBW_VERSION, "UNSUPPORTED_SEX")

  const infant = age.approximateMonths < 24
  const heightReference = infant
    ? CDC_INFANT_MEDIAN_LENGTH_CM[sex]
    : CDC_CHILD_MEDIAN_STATURE_CM[sex]
  const weightReference = infant
    ? CDC_INFANT_MEDIAN_WEIGHT_KG[sex]
    : CDC_CHILD_MEDIAN_WEIGHT_KG[sex]
  const referenceAgeMonths = interpolateAgeForMeasurement(input.heightCm, heightReference)
  if (referenceAgeMonths == null) {
    return unavailable(MCLAREN_IBW_VERSION, "OUTSIDE_REFERENCE_HEIGHT")
  }
  const kilograms = interpolateMedianAtAge(referenceAgeMonths, weightReference)
  if (kilograms == null) {
    return unavailable(MCLAREN_IBW_VERSION, "OUTSIDE_REFERENCE_HEIGHT")
  }
  return {
    available: true,
    kilograms,
    roundedKg: roundedKg(kilograms),
    method: MCLAREN_IBW_VERSION,
    methodVersion: CDC_GROWTH_REFERENCE_VERSION,
    sourceIds: ["MCLAREN_IBW_1972", "CDC_GROWTH_CHARTS_2000"],
    referenceMeasurement: infant ? "LENGTH" : "STATURE",
    referenceAgeMonths,
  }
}

export function resolveIdealBodyWeight(input: {
  clinicalMode: ClinicalMode
  heightCm?: number | null
  sex?: string | null
  age?: PediatricAgeInput | null
  preterm?: boolean | null
}): IdealBodyWeightResolution {
  if (input.clinicalMode !== "PEDIATRIC") return calculateDevineIdealBodyWeight(input)

  const mcLaren = calculateMcLarenIdealBodyWeight(input)
  if (mcLaren.available) return mcLaren

  // A grown adolescent runs off the top of the CDC growth reference — it ends
  // at the median stature for twenty years, about 163 cm for a girl and 176 cm
  // for a boy. Taller than that, McLaren could say nothing and every dose
  // calculated from ideal body weight silently stopped being suggested, for
  // patients who are otherwise entirely ordinary to anaesthetise.
  //
  // Devine covers exactly that range, and the two overlap rather than abut, so
  // handing over where McLaren runs out leaves no gap. It is done here and not
  // at five feet on purpose: near the top of the reference the two methods
  // agree closely (55.5 vs 55.1 kg for a girl at 163 cm), whereas switching at
  // five feet would put a step of around 17% into the middle of a common
  // adolescent height. The resolution carries its own `method` and `sourceIds`,
  // so the record shows which one produced the number.
  //
  // Only a height outside the reference falls through, and only upward. A
  // preterm infant, an unrecorded height, age or sex must keep their own
  // answer: Devine knows nothing about any of them.
  //
  // The anchor, not Devine's own refusal bound, is the gate here. Devine will
  // answer for a short adult somewhat below five feet, which is right for an
  // adult and wrong for a child — a small child also fails the growth
  // reference, and must never be handed an adult formula on the way out.
  if (mcLaren.reason !== "OUTSIDE_REFERENCE_HEIGHT") return mcLaren
  if (input.heightCm == null || input.heightCm < DEVINE_ANCHOR_HEIGHT_CM) return mcLaren
  const devine = calculateDevineIdealBodyWeight(input)
  return devine.available ? devine : mcLaren
}
