import { parseSyringe } from "./infusion-volume"
import { milligramsPerMillilitre } from "./volume-dose"
import {
  TCI_DRUG_SPECS, TCI_MODEL_DRUG, TCI_MODEL_LABELS, tciModelProblems, tciParams,
  type TciModel, type TciPatient, type TciSite, type TciUnits,
} from "./tci-models"
import { simulateTci, TCI_PUMP_MAX_ML_PER_MIN, TCI_STEP_MIN, type TciSimulation } from "./tci-simulate"
import type { PumpTotalUnit } from "./intraop-types"

export * from "./tci-models"
export { simulateTci, TCI_STEP_MIN, TCI_PUMP_MAX_ML_PER_MIN, type TciSegment, type TciSimulation, type TciStep } from "./tci-simulate"

/**
 * A target-controlled infusion as the chart holds it (2026-10-18): the
 * targets over time, the model and site, and the pump's own total if one was
 * entered on the stop. The totals, the volume and the predicted concentrations
 * all come from here, on every device.
 */
export type TciInfusionLike = {
  tciModel: TciModel
  tciSite?: TciSite
  tciOpioids?: boolean
  concentration?: string
  pumpTotal?: number
  pumpTotalUnit?: PumpTotalUnit
}

/** A target in force from an instant (ms), in the model's target unit. */
export type TciTargetChange = { atMs: number; target: number }

export type TciTotal = {
  /** The model's calculation; null when it cannot be made (see `unavailable`). */
  calculated: number | null
  /** The pump's own total in the amount unit, when entered and convertible. */
  pump: number | null
  /** What counts: the pump's total when known, else the calculation. */
  amount: number | null
  units: TciUnits
  /** Volume delivered, mL, when the syringe strength is known. */
  volumeMl: number | null
  unavailable?: "patient" | "model"
  /**
   * The pump's total was entered in mL with no syringe strength recorded, so
   * it cannot become an amount: the calculation counts, and the screen says
   * why (2026-10-19). It used to be dropped without a word.
   */
  pumpNeedsStrength?: true
}

/** The syringe's strength in the model's amount unit per mL; the drug's default when none is recorded. */
export function tciStrengthPerMl(model: TciModel, concentration: string | null | undefined): { perMl: number; recorded: boolean } {
  const spec = TCI_DRUG_SPECS[TCI_MODEL_DRUG[model]]
  // A syringe ("4 mg/50 mL") or a strength ("1%", "10 mg/mL"), in mg per mL.
  const syringe = parseSyringe(concentration)
  const toMg: Partial<Record<string, number>> = { ng: 1e-6, mcg: 1e-3, mg: 1, g: 1000 }
  const mgPerMl = syringe
    ? (toMg[syringe.amountUnit] != null && syringe.volumeMl > 0 ? syringe.amount * toMg[syringe.amountUnit]! / syringe.volumeMl : null)
    : milligramsPerMillilitre(concentration)
  const perMl = mgPerMl == null ? null : spec.units.amount === "mg" ? mgPerMl : mgPerMl * 1000
  return perMl != null && perMl > 0 ? { perMl, recorded: true } : { perMl: spec.defaultStrengthPerMl, recorded: false }
}

/** The pump's figure in the model's amount unit (a volume needs the strength). */
function pumpAmount(infusion: TciInfusionLike, perMl: number | null): number | null {
  const value = infusion.pumpTotal
  if (value == null || !Number.isFinite(value) || value < 0 || !infusion.pumpTotalUnit) return null
  const amountUnit = TCI_DRUG_SPECS[TCI_MODEL_DRUG[infusion.tciModel]].units.amount
  if (infusion.pumpTotalUnit === "mL") return perMl == null ? null : value * perMl
  if (infusion.pumpTotalUnit === amountUnit) return value
  return infusion.pumpTotalUnit === "mg" ? value * 1000 : value / 1000
}

/** The pump run over the targets from the first change to `endMs`. */
export function simulateTciInfusion(
  infusion: TciInfusionLike,
  changes: readonly TciTargetChange[],
  endMs: number,
  patient: TciPatient,
): TciSimulation | null {
  if (!changes.length || tciModelProblems(infusion.tciModel, patient).some(problem => problem.kind === "unavailable")) return null
  const startMs = changes[0].atMs
  const ordered = [...changes].sort((a, b) => a.atMs - b.atMs)
  const segments = ordered.map((change, index) => ({
    startMin: (change.atMs - startMs) / 60_000,
    endMin: ((index + 1 < ordered.length ? ordered[index + 1].atMs : endMs) - startMs) / 60_000,
    target: change.target,
  }))
  const { perMl } = tciStrengthPerMl(infusion.tciModel, infusion.concentration)
  return simulateTci({
    params: tciParams(infusion.tciModel, patient, { opioids: infusion.tciOpioids ?? true }),
    site: infusion.tciSite ?? "EFFECT",
    segments,
    maxRate: perMl * TCI_PUMP_MAX_ML_PER_MIN,
  })
}

export function tciTotal(
  infusion: TciInfusionLike,
  changes: readonly TciTargetChange[],
  endMs: number,
  patient: TciPatient | null,
): TciTotal {
  const units = TCI_DRUG_SPECS[TCI_MODEL_DRUG[infusion.tciModel]].units
  const strength = tciStrengthPerMl(infusion.tciModel, infusion.concentration)
  const recordedPerMl = strength.recorded ? strength.perMl : null
  const pump = pumpAmount(infusion, recordedPerMl)
  const simulation = patient ? simulateTciInfusion(infusion, changes, endMs, patient) : null
  const calculated = simulation ? Math.round(simulation.amount * 100) / 100 : null
  const amount = pump ?? calculated
  // A volume in mL is exactly what the pump showed, or the amount over the recorded strength.
  const pumpNeedsStrength = pump == null && infusion.pumpTotal != null && infusion.pumpTotalUnit === "mL" && recordedPerMl == null
  const volumeMl = infusion.pumpTotal != null && infusion.pumpTotalUnit === "mL" ? infusion.pumpTotal
    : amount != null && recordedPerMl != null ? Math.round((amount / recordedPerMl) * 10) / 10 : null
  return {
    calculated,
    pump: pump == null ? null : Math.round(pump * 100) / 100,
    amount: amount == null ? null : Math.round(amount * 100) / 100,
    units,
    volumeMl,
    ...(amount == null && !patient ? { unavailable: "patient" as const } : amount == null ? { unavailable: "model" as const } : {}),
    ...(pumpNeedsStrength ? { pumpNeedsStrength: true as const } : {}),
  }
}

/**
 * The patient as the models need them, from the preoperative record; null
 * when something is missing (age, weight, height or sex).
 */
export function tciPatientFrom(input: {
  ageYears?: number | null
  /** A child's age as entered (days, months or years) wins over whole years. */
  ageValue?: number | null
  ageUnit?: string | null
  weightKg?: number | null
  heightCm?: number | null
  sex?: string | null
}): TciPatient | null {
  const { weightKg, heightCm } = input
  const precise = input.ageValue != null && input.ageValue >= 0
    ? input.ageUnit === "DAYS" ? input.ageValue / 365.25
      : input.ageUnit === "MONTHS" ? input.ageValue / 12
        : input.ageUnit === "YEARS" ? input.ageValue : null
    : null
  const ageYears = precise ?? input.ageYears
  const sex = input.sex === "MALE" || input.sex === "FEMALE" ? input.sex : null
  if (ageYears == null || !(ageYears >= 0) || !(weightKg! > 0) || !(heightCm! > 0) || !sex) return null
  return { ageYears, weightKg: weightKg!, heightCm: heightCm!, sex }
}

/** Predicted Cp and Ce once a minute, for the chart's line; times in ms. */
export function tciPrediction(
  infusion: TciInfusionLike,
  changes: readonly TciTargetChange[],
  endMs: number,
  patient: TciPatient | null,
): { atMs: number; cp: number; ce: number }[] {
  const simulation = patient ? simulateTciInfusion(infusion, changes, endMs, patient) : null
  if (!simulation || !changes.length) return []
  const start = Math.min(...changes.map(change => change.atMs))
  const points = simulation.steps.filter((_, index) => index % 6 === 0).map(step => ({ atMs: start + step.t * 60_000, cp: step.cp, ce: step.ce }))
  points.push({ atMs: start + simulation.end.t * 60_000, cp: simulation.end.cp, ce: simulation.end.ce })
  return points
}

/**
 * The number of points at or before `atMs`, by bisection: a forgotten
 * infusion runs for weeks, and scanning its minute points once per column
 * froze the chart (2026-10-19). Points are in time order.
 */
export function tciPointsUpTo(points: readonly { atMs: number }[], atMs: number): number {
  let low = 0, high = points.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (points[middle].atMs <= atMs) low = middle + 1
    else high = middle
  }
  return low
}

/**
 * What a target asks of the pump, for the flyout before it starts: the
 * amount in the first ten minutes (the loading) and the hourly rate an hour
 * in. Null without a patient or for a model that cannot apply.
 */
export function tciPreview(input: {
  model: TciModel
  site: TciSite
  target: number
  opioids?: boolean
  concentration?: string
  patient: TciPatient | null
}): { firstTenMinutes: number; perHourAfter: number; units: TciUnits } | null {
  if (!input.patient || !(input.target > 0)) return null
  const simulation = simulateTciInfusion(
    { tciModel: input.model, tciSite: input.site, tciOpioids: input.opioids, concentration: input.concentration },
    [{ atMs: 0, target: input.target }], 60 * 60_000, input.patient,
  )
  if (!simulation) return null
  const sum = (from: number, to: number) => simulation.steps
    .filter(step => step.t >= from - 1e-9 && step.t < to - 1e-9)
    .reduce((total, step) => total + step.rate * TCI_STEP_MIN, 0)
  const round = (value: number) => Number(value.toPrecision(3))
  return {
    firstTenMinutes: round(sum(0, 10)),
    perHourAfter: round(sum(50, 60) * 6),
    units: TCI_DRUG_SPECS[TCI_MODEL_DRUG[input.model]].units,
  }
}

/** "Ce 4 mcg/mL · Schnider" for a TCI bar's text; null for any other infusion. */
export function tciTargetText(seg: { tciModel?: TciModel; tciSite?: TciSite; rate?: number | string; unit?: string }): string | null {
  if (!seg.tciModel) return null
  return `${seg.tciSite === "PLASMA" ? "Cp" : "Ce"} ${seg.rate ?? ""} ${seg.unit ?? ""} · ${TCI_MODEL_LABELS[seg.tciModel]}`.replace(/\s+/g, " ").trim()
}
