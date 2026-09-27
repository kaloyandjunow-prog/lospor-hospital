import { INFUSION_CATALOG } from "./catalog/intraop-infusions"
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
  /** Drafted for a future time: counts for nothing until its time passes. */
  planned?: boolean
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
  planned?: boolean
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
    if (fluid.planned) continue
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
    if (fluid.planned) continue
    const delivered = calculateFluidVolumeMl({
      fluidEntryMode: fluid.fluidEntryMode,
      bagVolumeMl: fluid.bagVolumeMl,
      administeredVolumeMl: fluid.administeredVolumeMl,
      legacyVolume: fluid.volume,
      startTs: fluid.startTs,
      endTs: fluid.endTs ?? asOf,
      rate: fluid.rate,
      rateChanges: fluid.rateChanges?.filter(change => !("planned" in change && change.planned)),
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

export type WeightBasis = "IBW" | "TBW" | "BSA_M2" | "none"
export type WeightBasisMap = Record<string, WeightBasis>

/**
 * The weight each catalogue infusion is dosed on, taken from the catalogue
 * itself (9.12.3). A hand-kept copy lived here before and disagreed with the
 * catalogue for eight per-kg drugs, so the web form (catalogue) and the PWA
 * and print (this copy) totalled the same infusion on different weights.
 */
export const DEFAULT_INFUSION_WEIGHT_BASIS: Readonly<WeightBasisMap> = Object.freeze(
  Object.fromEntries(
    INFUSION_CATALOG.flatMap(entry => {
      const basis = entry.profile.weightBasis
      return basis === "IBW" || basis === "TBW" || basis === "BSA_M2" || basis === "none"
        ? [[entry.name, basis]]
        : []
    }),
  ) as WeightBasisMap,
)

/** The basis to record on a new infusion's start event, from the library in force. */
export function infusionCalculationBasis(
  name: string,
  weightBasisMap: WeightBasisMap = DEFAULT_INFUSION_WEIGHT_BASIS,
): "FLAT" | "TBW" | "IBW" | "BSA_M2" {
  const basis = weightBasisMap[name] ?? DEFAULT_INFUSION_WEIGHT_BASIS[name] ?? "IBW"
  return basis === "none" ? "FLAT" : basis
}

export type TimetableInfusionLike = {
  name: string
  rate: number | string
  unit: string
  startCol: number
  endCol: number
  /** Real instants; with them a total is the time actually run, not whole columns. */
  startTs?: string
  endTs?: string
  rateChanges?: { col: number; rate: number | string; unit: string; ts?: string; eventId?: string; planned?: boolean }[]
  /** The basis recorded when the infusion was started; wins over any map. */
  calculationBasis?: "FLAT" | "TBW" | "IBW" | "BSA_M2"
  /** Drafted for a future time: nothing has been given yet. */
  planned?: boolean
}

export type InfusionTotal = {
  amount: number
  unit: string
  /** The weight a per-kg rate was multiplied by. */
  weightUsed: number | null
  /** Which weight that was. Differs from the drug's basis when `basisFallback`. */
  weightBasis: "IBW" | "TBW" | null
  /**
   * The drug is dosed on one weight and the other had to be used: an ideal
   * weight needs a height, and a case without one was totalled on actual
   * weight. Said, rather than labelled as the weight it was not.
   */
  basisFallback: boolean
  /** The body surface area a per-m² rate was multiplied by. */
  bsaUsed: number | null
  /**
   * A per-kg or per-m² rate with no weight or surface area recorded. The
   * amount is then per kilogram or per m² ("2.5 mcg/kg") rather than
   * multiplied by a size nobody entered.
   */
  weightMissing: boolean
  /**
   * Amounts that cannot be added to `amount`: a custom infusion switched
   * from mg/hr to mL/hr has two totals, and adding them would be wrong.
   */
  others: { amount: number; unit: string }[]
}

function numericRate(rate: number | string): number {
  return typeof rate === "number" ? rate : parseFloat(rate) || 0
}

// Mass units convert; everything else (mL, IU, mmol) totals only with itself.
const MICROGRAMS: Record<string, number> = { ng: 0.001, mcg: 1, "µg": 1, ug: 1, mg: 1000, g: 1_000_000 }

type RateUnit = { amountUnit: string; per: "kg" | "m2" | null; perMinute: boolean }

function parseRateUnit(unit: string): RateUnit {
  const match = unit.trim().match(/^(.*?)(\/kg|\/m²|\/m2)?\/(min|hr|h)$/i)
  if (!match) return { amountUnit: unit.trim(), per: null, perMinute: false }
  const per = !match[2] ? null : match[2].toLowerCase() === "/kg" ? "kg" : "m2"
  return { amountUnit: match[1].trim(), per, perMinute: match[3].toLowerCase() === "min" }
}

function instantMs(value: string | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

const COLUMN_MS = INTRAOP_COLUMN_MINUTES * 60_000

function columnIndex(ms: number): number {
  return Math.floor(ms / COLUMN_MS)
}

function positive(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null
}

export function calcInfusionTotal(
  infusion: TimetableInfusionLike,
  ibw: number | null = null,
  tbw: number | null = null,
  weightBasisMap: WeightBasisMap = DEFAULT_INFUSION_WEIGHT_BASIS,
  bodySurfaceAreaM2: number | null = null,
): InfusionTotal {
  // The basis recorded on the start event wins: a library edited after the
  // infusion was given does not change what it was given on (9.12.3).
  const recorded = infusion.calculationBasis
  const basis: WeightBasis = recorded === "FLAT" ? "none"
    : recorded ?? weightBasisMap[infusion.name] ?? DEFAULT_INFUSION_WEIGHT_BASIS[infusion.name] ?? "IBW"
  const ideal = positive(ibw)
  const actual = positive(tbw)
  const bsa = positive(bodySurfaceAreaM2)
  // A per-kg rate needs a weight whatever the drug's basis says; IBW unless
  // the drug is dosed on actual weight.
  const wantsActual = basis === "TBW"
  const weight = wantsActual ? (actual ?? ideal) : (ideal ?? actual)
  const weightBasisUsed: "IBW" | "TBW" | null = weight == null ? null
    : wantsActual ? (actual != null ? "TBW" : "IBW")
      : (ideal != null ? "IBW" : "TBW")
  const intended = wantsActual ? "TBW" : "IBW"

  // Only rate changes inside the drawn bar count: a change after the end (a
  // drafted future change, or one past the case end) delivered nothing.
  const changes = (infusion.rateChanges ?? [])
    .filter(change => !change.planned && change.col <= infusion.endCol)
    .slice()
    .sort((a, b) => a.col - b.col)

  // How long each segment ran. The real instants are used when the bar has
  // them and they still sit in the bar's columns; a bar just dragged in the
  // web chart, or one saved before 9.12.3, is counted in whole columns as it
  // always was. Whole columns round both ends up, which overstated a
  // 22-minute infusion by eight minutes.
  const startMs = instantMs(infusion.startTs)
  const endMs = instantMs(infusion.endTs)
  const changeMs = changes.map(change => instantMs(change.ts))
  const timed = startMs != null && endMs != null && endMs >= startMs
    && columnIndex(endMs) - columnIndex(startMs) === infusion.endCol - infusion.startCol
    && changes.every((change, index) => {
      const ms = changeMs[index]
      return ms != null && ms >= startMs && ms <= endMs
        && columnIndex(ms) - columnIndex(startMs) === change.col - infusion.startCol
    })
  const boundaries = timed
    ? [startMs, ...changeMs.map(ms => ms!), endMs]
    : [
        infusion.startCol * COLUMN_MS,
        ...changes.map(change => change.col * COLUMN_MS),
        (infusion.endCol + 1) * COLUMN_MS,
      ]

  const segments = [
    { rate: numericRate(infusion.rate), unit: parseRateUnit(infusion.unit) },
    ...changes.map(change => ({ rate: numericRate(change.rate), unit: parseRateUnit(change.unit) })),
  ]

  // Per kilogram or per m² stays in the unit when that size is unknown.
  const sizeFor = (unit: RateUnit) => unit.per === "kg" ? weight : unit.per === "m2" ? bsa : 1
  const suffixFor = (unit: RateUnit) =>
    unit.per === "kg" && weight == null ? "/kg" : unit.per === "m2" && bsa == null ? "/m²" : ""
  const familyOf = (unit: RateUnit) =>
    `${MICROGRAMS[unit.amountUnit.toLowerCase()] != null ? "mass" : unit.amountUnit.toLowerCase()}${suffixFor(unit)}`

  // Summed by what can be added together: mass in micrograms, anything else
  // by its own unit. The unit shown for each is the last one used, as before.
  const sums = new Map<string, { micrograms: boolean; value: number; unit: string }>()
  segments.forEach((segment, index) => {
    const minutes = Math.max(0, boundaries[index + 1] - boundaries[index]) / 60_000
    const amount = segment.rate * (segment.unit.perMinute ? minutes : minutes / 60) * (sizeFor(segment.unit) ?? 1)
    const factor = MICROGRAMS[segment.unit.amountUnit.toLowerCase()]
    const family = familyOf(segment.unit)
    const previous = sums.get(family)
    sums.set(family, {
      micrograms: factor != null,
      value: (previous?.value ?? 0) + (factor != null ? amount * factor : amount),
      unit: `${segment.unit.amountUnit}${suffixFor(segment.unit)}`,
    })
  })

  const shown = new Map([...sums].map(([family, sum]) => {
    const factor = sum.micrograms ? MICROGRAMS[sum.unit.replace(/\/(kg|m²)$/, "").toLowerCase()] : 1
    const amount = infusion.planned ? 0 : sum.value / factor
    return [family, { amount: Math.round(amount * 100) / 100, unit: sum.unit }]
  }))
  const primaryFamily = familyOf(segments[segments.length - 1].unit)
  const primary = shown.get(primaryFamily)!
  const anyPerKg = segments.some(segment => segment.unit.per === "kg")
  const anyPerM2 = segments.some(segment => segment.unit.per === "m2")

  return {
    amount: primary.amount,
    unit: primary.unit,
    weightUsed: anyPerKg && weight != null ? Math.round(weight * 10) / 10 : null,
    weightBasis: anyPerKg ? weightBasisUsed : null,
    basisFallback: anyPerKg && weightBasisUsed != null && weightBasisUsed !== intended,
    bsaUsed: anyPerM2 && bsa != null ? Math.round(bsa * 100) / 100 : null,
    weightMissing: (anyPerKg && weight == null) || (anyPerM2 && bsa == null),
    others: [...shown].filter(([family]) => family !== primaryFamily).map(([, item]) => item),
  }
}

/**
 * "250 mcg", or "250 mcg + 12 mL" when a unit switch left two totals, and
 * "540 mg (TBW)" when a drug dosed on ideal weight had to be counted on actual
 * weight. The abbreviations are the ones the record already prints beside the
 * weights, in both languages.
 */
export function formatInfusionTotal(
  total: Pick<InfusionTotal, "amount" | "unit" | "others"> & Partial<Pick<InfusionTotal, "basisFallback" | "weightBasis">>,
): string {
  const text = [total, ...total.others].map(item => `${item.amount} ${item.unit}`).join(" + ")
  return total.basisFallback && total.weightBasis ? `${text} (${total.weightBasis})` : text
}

export function calcInfusionTotals<TInfusion extends TimetableInfusionLike>(
  infusions: TInfusion[],
  ibw: number | null,
  tbw: number | null,
  weightBasisMap: WeightBasisMap = DEFAULT_INFUSION_WEIGHT_BASIS,
  bodySurfaceAreaM2: number | null = null,
): (InfusionTotal & { name: string; total: number })[] {
  return infusions.map(infusion => {
    const total = calcInfusionTotal(infusion, ibw, tbw, weightBasisMap, bodySurfaceAreaM2)
    return { ...total, name: infusion.name, total: total.amount }
  })
}

type InfusionWithEvents = TimetableInfusionLike & {
  startEventId?: string
  stopEventId?: string
  plannedStopCol?: number
  rateChanges?: { col: number; rate: number | string; unit: string; ts?: string; eventId?: string }[]
}

/**
 * A saved chart's infusions with their real instants filled in from the saved
 * event log, for charts projected before 9.12.3 carried them. Display only:
 * the stored record is not rewritten. An infusion still running at the case
 * end runs to the end; without an end time it keeps whole columns.
 */
export function withInfusionInstants<T extends InfusionWithEvents>(
  infusions: T[],
  log: { id?: string; ts?: string }[] | undefined,
  endedAt?: Date | string | null,
): T[] {
  if (!log?.length) return infusions
  const instants = new Map(log.flatMap(event => event.id && event.ts ? [[event.id, event.ts] as const] : []))
  const end = endedAt == null ? undefined : new Date(endedAt).toISOString()
  return infusions.map(infusion => {
    if (infusion.startTs) return infusion
    const startTs = infusion.startEventId ? instants.get(infusion.startEventId) : undefined
    const endTs = infusion.stopEventId && infusion.plannedStopCol == null
      ? instants.get(infusion.stopEventId)
      : end
    return {
      ...infusion,
      ...(startTs ? { startTs } : {}),
      ...(endTs ? { endTs } : {}),
      ...(infusion.rateChanges
        ? {
            rateChanges: infusion.rateChanges.map(change => ({
              ...change,
              ts: change.ts ?? (change.eventId ? instants.get(change.eventId) : undefined),
            })),
          }
        : {}),
    }
  })
}
