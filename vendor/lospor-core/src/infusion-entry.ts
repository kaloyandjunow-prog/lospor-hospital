import type { TciModel, TciSite } from "./tci-models"
import type { DoseLimit } from "./catalog/dose-profile"
import {
  alternativeDoseUnits,
  convertDoseRate,
  doseRateFromPump,
  isVolumeRateUnit,
  PUMP_RATE_UNIT,
  pumpRateMlPerHour,
  roundRate,
} from "./infusion-volume"
import { volumeRateSurface } from "./volume-dose"

/**
 * The infusion entry both apps share (2026-10-18): which units the rate may be
 * entered in, the slider for each, what switching unit does to the value, the
 * readout beside it, and what is recorded.
 *
 * The rule's unit is the drug's own (mcg/kg/min, mg/hr, or mL/kg/hr for a
 * child's local anaesthetic). The clinician may enter it in another dose unit
 * of the same amount (per kg or not) or as the pump rate, mL/hr. What is saved
 * is always both: the dose rate in a dose unit, and the pump rate when the
 * strength (and, per kg, the weight) makes it knowable. Without a strength a
 * mL/hr entry is saved as a volume rate alone.
 */

export type InfusionEntryInput = {
  /** The drug, for the units it is charted in (alternativeDoseUnits). */
  name?: string | null
  /** The rule's unit. */
  unit: string
  min: number
  max: number
  step: number
  quickValues?: readonly number[]
  /** A local anaesthetic volume rate limited by dose (volume-dose.ts). */
  doseLimit?: DoseLimit
  /** The strength picked: a syringe ("4 mg/50 mL") or a % for a local anaesthetic. */
  concentration?: string | null
  /** The weight per-kg rates are worked out on. */
  weightKg?: number | null
}

const weightOf = (weightKg: number | null | undefined) => weightKg != null && weightKg > 0 ? weightKg : null

/** The units the rate may be entered in, the rule's first. */
export function infusionEntryUnits(input: Pick<InfusionEntryInput, "name" | "unit" | "weightKg">): string[] {
  const weight = weightOf(input.weightKg)
  if (isVolumeRateUnit(input.unit)) {
    return /\/kg\//i.test(input.unit) && weight != null ? [input.unit, PUMP_RATE_UNIT] : [input.unit]
  }
  const doseUnits = alternativeDoseUnits(input.unit, input.name)
    .filter(unit => unit === input.unit || convertDoseRate(1, input.unit, unit, weight) != null)
  return [...doseUnits, PUMP_RATE_UNIT]
}

/** The value in another entry unit; null when it cannot be converted (the box is cleared). */
export function convertInfusionEntry(input: InfusionEntryInput & { value: number; from: string; to: string }): number | null {
  const { value, from, to } = input
  if (!Number.isFinite(value)) return null
  if (from === to) return value
  const context = { concentration: input.concentration, weightKg: input.weightKg }
  if (to === PUMP_RATE_UNIT) {
    const pump = pumpRateMlPerHour({ rate: value, unit: from, ...context })
    return pump == null ? null : roundRate(pump)
  }
  if (from === PUMP_RATE_UNIT) {
    const rate = isVolumeRateUnit(to)
      ? (weightOf(input.weightKg) == null ? null : value / weightOf(input.weightKg)!)
      : doseRateFromPump({ mlPerHour: value, unit: to, ...context })
    return rate == null ? null : roundRate(rate)
  }
  const converted = convertDoseRate(value, from, to, input.weightKg)
  return converted == null ? null : roundRate(converted)
}

/** A slider step that reads well: 1, 2 or 5 times a power of ten. */
function niceStep(value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) return 0.1
  const power = 10 ** Math.floor(Math.log10(value))
  const fraction = value / power
  return Number(((fraction >= 5 ? 5 : fraction >= 2 ? 2 : 1) * power).toPrecision(6))
}

export type InfusionEntrySurface = {
  min: number
  max: number
  step: number
  /** One-tap values, in the rule's unit only. */
  quickValues?: number[]
  /** The rule's suggestion in the rule's unit after a strength change, for a dose-limited volume. */
  suggestedRate?: number
}

/**
 * The slider for one entry unit. The rule's unit keeps the rule's range (a
 * dose-limited volume follows the strength); another unit carries the same
 * maximum across, converted. Pills belong to the rule's unit only.
 */
export function infusionEntrySurface(input: InfusionEntryInput & { entryUnit: string }): InfusionEntrySurface {
  const limited = volumeRateSurface({
    max: input.max,
    step: input.step,
    quickValues: input.quickValues ?? [],
    doseLimit: input.doseLimit,
    concentration: input.concentration,
  })
  if (input.entryUnit === input.unit) {
    return {
      min: input.min,
      max: limited.max,
      step: input.step,
      quickValues: input.quickValues ? limited.quickValues : undefined,
      ...(limited.suggestedRate == null ? {} : { suggestedRate: limited.suggestedRate }),
    }
  }
  const max = convertInfusionEntry({ ...input, value: limited.max, from: input.unit, to: input.entryUnit })
  if (max == null || !(max > 0)) return { min: 0, max: 100_000, step: 0.1 }
  const step = input.entryUnit === PUMP_RATE_UNIT ? 0.1 : niceStep((convertInfusionEntry({ ...input, value: input.step, from: input.unit, to: input.entryUnit }) ?? 0.1))
  return { min: 0, max, step }
}

export type InfusionRecord = {
  /** The dose rate, or the volume rate when no dose rate is knowable. */
  rate: number
  unit: string
  /** The pump rate, when knowable. */
  volumeRateMlPerHour?: number
  /** The weight a per-kg rate was worked out on. */
  calculationWeightKg?: number
  /** Started as a target-controlled infusion: `rate` is the target in `unit` (2026-10-18). */
  tci?: { model: TciModel; site: TciSite; opioids?: boolean }
}

/**
 * What a start or change records for a value entered in `entryUnit`. A pump
 * rate is saved as the dose rate in `doseUnit` (the dose unit last chosen, the
 * rule's by default) beside the pump rate; without a strength it is saved as a
 * volume rate.
 */
export function infusionRecord(input: InfusionEntryInput & { value: number; entryUnit: string; doseUnit?: string }): InfusionRecord | null {
  const { value, entryUnit } = input
  if (!Number.isFinite(value) || value < 0) return null
  const weight = weightOf(input.weightKg)
  const doseUnit = input.doseUnit ?? input.unit
  const context = { concentration: input.concentration, weightKg: input.weightKg }
  const perKg = (unit: string) => /\/kg\//i.test(unit)
  if (entryUnit === PUMP_RATE_UNIT) {
    const rate = convertInfusionEntry({ ...input, value, from: PUMP_RATE_UNIT, to: doseUnit })
    if (rate == null) return { rate: value, unit: PUMP_RATE_UNIT, volumeRateMlPerHour: value }
    return {
      rate,
      unit: doseUnit,
      volumeRateMlPerHour: value,
      ...(perKg(doseUnit) && weight != null ? { calculationWeightKg: weight } : {}),
    }
  }
  const pump = pumpRateMlPerHour({ rate: value, unit: entryUnit, ...context })
  return {
    rate: value,
    unit: entryUnit,
    ...(pump == null ? {} : { volumeRateMlPerHour: roundRate(pump) }),
    ...(perKg(entryUnit) && weight != null ? { calculationWeightKg: weight } : {}),
  }
}

export type InfusionReadout = {
  /** The pump rate, when the value is not already one. */
  pumpMlPerHour?: number
  /** The per-kg volume rate a pump rate gives (a child's local anaesthetic). */
  volumeRate?: { value: number; unit: string }
  /** The dose rate, when the value is a pump rate (or a local anaesthetic volume). */
  doseRate?: { value: number; unit: string }
}

/** The numbers beside the box: the pump rate of a dose rate, or the dose rate of a pump rate. */
export function infusionReadout(input: InfusionEntryInput & { value: number; entryUnit: string; doseUnit?: string }): InfusionReadout {
  const record = infusionRecord(input)
  if (!record || !(input.value > 0)) return {}
  if (input.entryUnit === PUMP_RATE_UNIT) {
    if (record.unit === PUMP_RATE_UNIT) return {}
    if (!isVolumeRateUnit(record.unit)) return { doseRate: { value: record.rate, unit: record.unit } }
    const laUnit = /\/kg\//i.test(record.unit) ? "mg/kg/hr" : "mg/hr"
    const mg = convertInfusionEntry({ ...input, value: input.value, from: PUMP_RATE_UNIT, to: laUnit })
    return { volumeRate: { value: record.rate, unit: record.unit }, ...(mg == null ? {} : { doseRate: { value: mg, unit: laUnit } }) }
  }
  const out: InfusionReadout = {}
  if (record.volumeRateMlPerHour != null) out.pumpMlPerHour = roundRate(record.volumeRateMlPerHour)
  // A volume rate of a local anaesthetic: its dose, from the % strength.
  if (isVolumeRateUnit(input.entryUnit) && record.volumeRateMlPerHour != null) {
    const doseUnit = /\/kg\//i.test(input.entryUnit) ? "mg/kg/hr" : "mg/hr"
    const mg = convertInfusionEntry({ ...input, value: record.volumeRateMlPerHour, from: PUMP_RATE_UNIT, to: doseUnit })
    if (mg != null) out.doseRate = { value: mg, unit: doseUnit }
  }
  return out
}

/**
 * The weight an infusion's per-kg rates are worked out on: its recorded basis
 * (calcInfusionTotal's rule), so the pump rate and the drug total agree. Ideal
 * weight needs a height; without one the actual weight stands in, as there.
 */
export function infusionEntryWeightKg(input: {
  basis: "FLAT" | "TBW" | "IBW" | "BSA_M2" | null | undefined
  idealWeightKg?: number | null
  actualWeightKg?: number | null
}): number | null {
  const ideal = weightOf(input.idealWeightKg)
  const actual = weightOf(input.actualWeightKg)
  return input.basis === "TBW" ? actual ?? ideal : ideal ?? actual
}

/**
 * Switching the entry unit: the value carried across and rounded to the new
 * unit's slider step, so what the box shows is what is recorded (a pump runs
 * in 0.1 mL/hr). Null when it cannot be converted.
 */
export function switchInfusionEntry(input: InfusionEntryInput & { value: number; from: string; to: string }): number | null {
  const converted = convertInfusionEntry(input)
  if (converted == null) return null
  const { step } = infusionEntrySurface({ ...input, entryUnit: input.to })
  if (!(step > 0)) return converted
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1)
  return Number((Math.round(converted / step) * step).toFixed(decimals))
}

export type InfusionConfirmProblem = "rate" | "strength" | "formulation"

/**
 * Why an infusion cannot be started or its rate changed yet, so the screen
 * says so beside the greyed-out button rather than refusing in silence
 * (2026-10-18). Null when it can. A stop is its own action, so a rate must be
 * above 0. A syringe typed with Other reports its own problem in its fields.
 */
export function infusionConfirmProblem(input: {
  rate: number | string | null | undefined
  strengthMissing?: boolean
  formulationMissing?: boolean
}): InfusionConfirmProblem | null {
  const rate = typeof input.rate === "string" ? (input.rate.trim() ? Number(input.rate) : Number.NaN) : input.rate ?? Number.NaN
  if (!Number.isFinite(rate) || rate <= 0) return "rate"
  if (input.strengthMissing) return "strength"
  if (input.formulationMissing) return "formulation"
  return null
}

export type DoseConfirmProblem = "dose" | "strength" | "formulation"

/**
 * The same for a bolus: why Administer is held back, so the screen says so.
 * Null when it can be given.
 */
export function doseConfirmProblem(input: {
  dose: number | string | null | undefined
  strengthMissing?: boolean
  formulationMissing?: boolean
}): DoseConfirmProblem | null {
  const problem = infusionConfirmProblem({ ...input, rate: input.dose })
  return problem === "rate" ? "dose" : problem
}
