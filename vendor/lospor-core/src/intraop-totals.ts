import { INTRAOP_COLUMN_MINUTES } from "./intraop-engine"
import {
  calculateFluidVolumeMl,
  type FluidEntryMode,
  type FluidRateChangeInput,
} from "./intraop-fluids"

export type TimedFluid = {
  id: string
  volume: string
  category?: string
  startCol: number
}

export type TimetableLike = {
  fluids: TimedFluid[]
}

export type FluidTotals = {
  crystalloids: number
  colloids: number
  blood: number
}

/** The fields a delivered-volume total needs; TimetableFluid satisfies it. */
export type DeliveredFluidLike = {
  category?: string
  volume?: string
  fluidEntryMode?: FluidEntryMode
  startTs?: string
  endTs?: string
  bagVolumeMl?: number
  administeredVolumeMl?: number
  rate?: number | string
  rateChanges?: readonly FluidRateChangeInput[]
}

export type NewChartFluidEvent<TFluid extends TimedFluid = TimedFluid> = {
  fluid: TFluid
  ts: string
}

export function newChartFluidsWithTimestamps<TData extends TimetableLike>(
  previous: TData,
  next: TData,
  chartStart: Date,
): NewChartFluidEvent<TData["fluids"][number]>[] {
  const previousIds = new Set(previous.fluids.map(fluid => fluid.id))
  return next.fluids
    .filter(fluid => !previousIds.has(fluid.id))
    .map(fluid => ({
      fluid,
      ts: new Date(
        chartStart.getTime() + fluid.startCol * INTRAOP_COLUMN_MINUTES * 60_000,
      ).toISOString(),
    }))
}

export function calculateFluidTotals(fluids: TimedFluid[] | undefined): FluidTotals {
  const totals: FluidTotals = { crystalloids: 0, colloids: 0, blood: 0 }
  for (const fluid of fluids ?? []) {
    const parsed = Number(fluid.volume)
    const volume = Number.isFinite(parsed) && parsed > 0
      ? Math.min(Number.MAX_SAFE_INTEGER, Math.round(parsed))
      : 0
    if (!volume) continue
    if (fluid.category === "Crystalloids") {
      totals.crystalloids = Math.min(Number.MAX_SAFE_INTEGER, totals.crystalloids + volume)
    } else if (fluid.category === "Colloids") {
      totals.colloids = Math.min(Number.MAX_SAFE_INTEGER, totals.colloids + volume)
    } else if (fluid.category === "Blood products") {
      totals.blood = Math.min(Number.MAX_SAFE_INTEGER, totals.blood + volume)
    }
  }
  return totals
}

/**
 * Category totals from the volume actually delivered so far, not the stored
 * `volume` string.
 *
 * `calculateFluidTotals` above sums `fluid.volume`, which is only written when
 * a fluid is stopped. For a rate-mode infusion still running that field is
 * stale — often zero — so a totals view built on it silently undercounts the
 * crystalloid a patient is receiving right now. `calculateFluidVolumeMl`
 * integrates rate against the real clock instead, which is what a live view
 * has to show. Pass the same `asOf` to every fluid so one view is internally
 * consistent.
 */
export function calculateDeliveredFluidTotals(
  fluids: DeliveredFluidLike[] | undefined,
  asOf: Date | string | number = new Date(),
): FluidTotals {
  const totals: FluidTotals = { crystalloids: 0, colloids: 0, blood: 0 }
  for (const fluid of fluids ?? []) {
    const delivered = calculateFluidVolumeMl({
      fluidEntryMode: fluid.fluidEntryMode,
      bagVolumeMl: fluid.bagVolumeMl,
      administeredVolumeMl: fluid.administeredVolumeMl,
      legacyVolume: fluid.volume,
      startTs: fluid.startTs,
      endTs: fluid.endTs ?? asOf,
      rate: fluid.rate,
      rateChanges: fluid.rateChanges,
    })
    if (!Number.isFinite(delivered) || delivered <= 0) continue
    const volume = Math.min(Number.MAX_SAFE_INTEGER, Math.round(delivered))
    if (fluid.category === "Crystalloids") {
      totals.crystalloids = Math.min(Number.MAX_SAFE_INTEGER, totals.crystalloids + volume)
    } else if (fluid.category === "Colloids") {
      totals.colloids = Math.min(Number.MAX_SAFE_INTEGER, totals.colloids + volume)
    } else if (fluid.category === "Blood products") {
      totals.blood = Math.min(Number.MAX_SAFE_INTEGER, totals.blood + volume)
    }
  }
  return totals
}

export function fluidTotalsKey(totals: FluidTotals): string {
  return `${totals.crystalloids}|${totals.colloids}|${totals.blood}`
}

export function fluidTotalsPatch(totals: FluidTotals): Record<string, number | null> {
  return {
    crystalloidsMl: totals.crystalloids || null,
    colloidsMl: totals.colloids || null,
    bloodMl: totals.blood || null,
  }
}

/**
 * The percentage in a local-anaesthetic name — "Bupivacaine 0.25%" → 0.25.
 *
 * Lived in the web intraop form only, which meant the mg-equivalent of an LA
 * infusion could be read on a desktop and not at the bedside. It is a clinical
 * conversion, so it belongs beside the totals that use it.
 */
export function parseLocalAnaestheticPercent(name: string): number | null {
  const match = name.match(/(\d+(?:\.\d+)?)%/)
  return match ? parseFloat(match[1]) : null
}

/**
 * Milligrams delivered for a volume of a percentage-strength solution.
 * A 1% solution is 10 mg/mL, so mg = mL × percent × 10.
 */
export function localAnaestheticMg(volumeMl: number, percent: number): number {
  return Math.round(volumeMl * percent * 10 * 100) / 100
}

/**
 * The mg-equivalent for an infusion total, or null when it is not a
 * percentage-strength local anaesthetic measured in millilitres.
 */
export function infusionLocalAnaestheticMg(name: string, total: number, unit: string): number | null {
  if (unit.toLowerCase() !== "ml") return null
  const percent = parseLocalAnaestheticPercent(name)
  return percent === null ? null : localAnaestheticMg(total, percent)
}

export type WeightBasis = "IBW" | "TBW" | "none"
export type WeightBasisMap = Record<string, WeightBasis>

export const DEFAULT_INFUSION_WEIGHT_BASIS: Readonly<WeightBasisMap> = {
  Propofol: "IBW",
  Remifentanil: "IBW",
  Ketamine: "IBW",
  Midazolam: "IBW",
  Dexmedetomidine: "TBW",
  Fentanyl: "IBW",
  Sufentanil: "IBW",
  Morphine: "IBW",
  Alfentanil: "IBW",
  Norepinephrine: "IBW",
  Epinephrine: "IBW",
  Phenylephrine: "TBW",
  Dopamine: "TBW",
  Dobutamine: "TBW",
  Rocuronium: "IBW",
  Cisatracurium: "IBW",
  Nitroglycerin: "TBW",
}

export type TimetableInfusionLike = {
  name: string
  rate: number | string
  unit: string
  startCol: number
  endCol: number
  rateChanges?: { col: number; rate: number | string; unit: string }[]
}

export type InfusionTotal = {
  amount: number
  unit: string
  weightUsed: number | null
  weightBasis: WeightBasis | null
}

function numericRate(rate: number | string): number {
  return typeof rate === "number" ? rate : parseFloat(rate) || 0
}

export function calcInfusionTotal(
  infusion: TimetableInfusionLike,
  ibw: number | null = null,
  tbw: number | null = null,
  weightBasisMap: WeightBasisMap = {},
): InfusionTotal {
  const basis = weightBasisMap[infusion.name] ?? "IBW"
  const bodyWeight = basis === "TBW" ? (tbw ?? ibw) : (ibw ?? tbw)

  function segmentTotal(rate: number, unit: string, columns: number): number {
    const isPerKg = unit.includes("/kg/")
    const weight = isPerKg && bodyWeight ? bodyWeight : 1
    const minutes = unit.includes("/min") ? columns * 5 : columns * 5 / 60
    return rate * weight * minutes
  }

  const sorted = (infusion.rateChanges ?? []).slice().sort((a, b) => a.col - b.col)
  let total = 0
  let previousColumn = infusion.startCol
  let previousRate = numericRate(infusion.rate)
  let previousUnit = infusion.unit

  for (const rateChange of sorted) {
    total += segmentTotal(previousRate, previousUnit, rateChange.col - previousColumn)
    previousColumn = rateChange.col
    previousRate = numericRate(rateChange.rate)
    previousUnit = rateChange.unit
  }

  total += segmentTotal(previousRate, previousUnit, infusion.endCol - previousColumn + 1)

  const baseUnit = previousUnit
    .replace(/\/kg\/min$/, "")
    .replace(/\/kg\/hr$/, "")
    .replace(/\/min$/, "")
    .replace(/\/hr$/, "")
    .trim()

  const anyPerKg = infusion.unit.includes("/kg/") || (infusion.rateChanges ?? []).some(change => change.unit.includes("/kg/"))
  const weightUsed = anyPerKg && bodyWeight ? Math.round(bodyWeight * 10) / 10 : null

  return {
    amount: Math.round(total * 100) / 100,
    unit: baseUnit,
    weightUsed,
    weightBasis: anyPerKg ? basis : null,
  }
}

export function calcInfusionTotals<TInfusion extends TimetableInfusionLike>(
  infusions: TInfusion[],
  ibw: number | null,
  tbw: number | null,
  weightBasisMap: WeightBasisMap,
): (InfusionTotal & { name: string; total: number })[] {
  return infusions.map(infusion => {
    const total = calcInfusionTotal(infusion, ibw, tbw, weightBasisMap)
    return {
      name: infusion.name,
      total: total.amount,
      unit: total.unit,
      weightUsed: total.weightUsed,
      weightBasis: total.weightBasis,
      amount: total.amount,
    }
  })
}
