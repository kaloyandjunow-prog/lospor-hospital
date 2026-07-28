import { INTRAOP_COLUMN_MINUTES } from "./intraop-engine"

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
    const volume = parseFloat(fluid.volume) || 0
    if (!volume) continue
    if (fluid.category === "Crystalloids") totals.crystalloids += volume
    else if (fluid.category === "Colloids") totals.colloids += volume
    else if (fluid.category === "Blood products") totals.blood += volume
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
