import { infusionEntryWeightKg, infusionRecord } from "@lospor/core/infusion-entry"
import { PUMP_RATE_UNIT } from "@lospor/core/infusion-volume"
import { infusionCalculationBasis, type WeightBasisMap } from "@lospor/core/intraop-totals"
import type { createDoseSurfaces } from "./dose-surfaces"
import type { RateChangeState } from "./RateChangeDialog"
import { TCI_DRUG_SPECS, TCI_MODEL_DRUG, type TciModel } from "@lospor/core/tci"

export type { InfusionRecord } from "@lospor/core/infusion-entry"

/**
 * The range a running infusion's rate may be changed within, and the weight
 * its pump rate is worked out on.
 *
 * Adults keep the library range. A child's local anaesthetic infusion keeps
 * its paediatric rule instead -- mL/kg/hr limited by dose at the strength
 * running -- so the change sheet cannot offer more than the start sheet did.
 * Guidance off leaves the range open.
 */
export function rateDialogSurface(input: {
  name: string
  route?: string
  /** The unit it is running in, which may be another than the drug's own. */
  runningUnit: string
  cfg: { units: string[]; min: number; max: number; step: number }
  guidance: boolean
  isPediatric: boolean
  doseSurfaces: ReturnType<typeof createDoseSurfaces>
  weights: { tbw?: number | null; ibw?: number | null; basis: WeightBasisMap }
  /** A TCI infusion changes its target, in its model's range (2026-10-18). */
  tciModel?: TciModel
}): Pick<RateChangeState, "units" | "rateMin" | "rateMax" | "rateStep" | "doseLimit" | "quickValues" | "concentrationOptions" | "ruleUnit" | "doseUnit" | "weightKg" | "tci"> {
  if (input.tciModel) {
    const spec = TCI_DRUG_SPECS[TCI_MODEL_DRUG[input.tciModel]]
    return {
      units: [spec.units.target], rateMin: spec.target.min, rateMax: spec.target.max, rateStep: spec.target.step,
      quickValues: spec.target.quickValues, ruleUnit: spec.units.target, weightKg: null, tci: true,
    }
  }
  const pediatric = input.isPediatric && input.guidance
    ? input.doseSurfaces.clinicalPediatricInfusionFor(input.name, input.route).surface
    : null
  const weightKg = input.isPediatric
    ? input.weights.tbw ?? null
    : infusionEntryWeightKg({ basis: infusionCalculationBasis(input.name, input.weights.basis), idealWeightKg: input.weights.ibw, actualWeightKg: input.weights.tbw })
  const doseUnit = input.runningUnit === PUMP_RATE_UNIT ? undefined : input.runningUnit
  if (pediatric?.doseLimit) {
    return {
      units: [pediatric.unit],
      rateMin: pediatric.min,
      rateMax: pediatric.max,
      rateStep: pediatric.step,
      doseLimit: pediatric.doseLimit,
      quickValues: pediatric.quickValues,
      concentrationOptions: pediatric.concentrationOptions,
      ruleUnit: pediatric.unit,
      doseUnit,
      weightKg,
    }
  }
  return {
    units: input.cfg.units,
    rateMin: input.guidance ? input.cfg.min : 0,
    rateMax: input.guidance ? input.cfg.max : 100_000,
    rateStep: input.guidance ? input.cfg.step : 0.1,
    ruleUnit: input.cfg.units[0],
    doseUnit,
    weightKg,
  }
}

/**
 * What a rate change records, from the dialog as it stands: the dose rate in
 * a dose unit and the pump rate beside it (2026-10-18), whatever unit the
 * value was entered in. Falls back to the value as entered.
 */
export function rateDialogChange(state: RateChangeState): {
  rate: number
  unit: string
  concentration?: string
  volumeRateMlPerHour?: number
} {
  // A TCI target is recorded as entered: the model, not a rate, makes the amount.
  if (state.tci) return { rate: state.rate, unit: state.unit, concentration: state.concentration }
  const unit = state.ruleUnit ?? state.unit
  const record = infusionRecord({
    unit,
    min: state.rateMin,
    max: state.rateMax,
    step: state.rateStep,
    doseLimit: state.doseLimit,
    concentration: state.concentration,
    weightKg: state.weightKg,
    value: state.rate,
    entryUnit: state.unit,
    doseUnit: state.doseUnit ?? (unit === PUMP_RATE_UNIT ? undefined : unit),
  })
  return {
    rate: record?.rate ?? state.rate,
    unit: record?.unit ?? state.unit,
    concentration: state.concentration,
    ...(record?.volumeRateMlPerHour != null ? { volumeRateMlPerHour: record.volumeRateMlPerHour } : {}),
  }
}
