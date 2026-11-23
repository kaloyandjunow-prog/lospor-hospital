import { calcInfusionTotal, formatInfusionTotal, DEFAULT_INFUSION_WEIGHT_BASIS, type WeightBasisMap } from "./intraop-totals"
import { calculateFluidVolumeMl } from "./intraop-fluids"
import type { TciPatient } from "./tci"
import type { TimetableData, TimetableFluid, TimetableInfusion } from "./intraop-types"

/**
 * What a running or finished item has come to, as both charts write it (10.8.0, rule 5):
 * an infusion's amount given, a fluid's volume with how long it ran and at what rate, and for
 * an agent, gas or jet how long it has run. One function, so the web lane's total after a bar
 * and the PWA's open row say the same words.
 */
export type RunTotalContext = {
  ibw: number | null
  tbw: number | null
  weightBasis?: WeightBasisMap
  bodySurfaceAreaM2?: number | null
  tciPatient?: TciPatient | null
  /** The reading time: a running item has run until then. */
  now: Date | string | number
  language: "bg" | "en"
}

const COLUMN_MINUTES = 5
const ms = (value: Date | string | number) => value instanceof Date ? value.getTime() : typeof value === "number" ? value : new Date(value).getTime()

/** "30 min", "1 h", "1 h 15 min" -- the units are the same in every language. */
export function intraopMinutesLabel(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes))
  if (whole < 60) return `${whole} min`
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** Minutes from the real start to the real end (or now) when both are known, else whole 5-minute cells. */
function runMinutes(seg: { startCol: number; endCol: number; stopped?: boolean; startTs?: string; endTs?: string }, now: number, column: number): number {
  // A stopped run with no recorded end is counted in whole cells: "until now" would keep growing after it stopped.
  if (seg.startTs && ms(seg.startTs) > 0 && !(seg.stopped && !seg.endTs)) {
    const end = seg.stopped && seg.endTs ? ms(seg.endTs) : Math.min(now, Math.max(ms(seg.startTs), seg.endTs ? ms(seg.endTs) : now))
    if (end >= ms(seg.startTs)) return (end - ms(seg.startTs)) / 60_000
  }
  return Math.max(0, Math.min(seg.endCol, column) - seg.startCol + 1) * COLUMN_MINUTES
}

function currentFluidRate(fluid: TimetableFluid): number | null {
  const change = [...(fluid.rateChanges ?? [])].filter(item => !item.planned).sort((a, b) => a.col - b.col).pop()
  const value = Number(change?.rate ?? fluid.rate)
  return Number.isFinite(value) && value > 0 ? value : null
}

/** A fluid: how much, in how long, at what rate -- "750 mL · 1 h 30 min · 500 mL/h" or "300 mL of a 500 mL bag · 40 min". */
export function intraopFluidTotalLabel(fluid: TimetableFluid, ctx: Pick<RunTotalContext, "now" | "language">, column = fluid.endCol): string {
  const now = ms(ctx.now)
  const minutes = runMinutes(fluid, now, column)
  const mode = fluid.fluidEntryMode === "RATE" ? "RATE" : "VOLUME"
  let delivered: number
  try {
    delivered = calculateFluidVolumeMl({
      fluidEntryMode: mode, bagVolumeMl: fluid.bagVolumeMl, administeredVolumeMl: fluid.administeredVolumeMl, legacyVolume: fluid.volume,
      startTs: fluid.startTs, endTs: fluid.stopped ? (fluid.endTs ?? (fluid.startTs ? new Date(ms(fluid.startTs) + minutes * 60_000).toISOString() : new Date(now).toISOString())) : new Date(now).toISOString(), rate: fluid.rate,
      rateChanges: (fluid.rateChanges ?? []).filter(change => !change.planned),
    } as never)
  } catch { delivered = 0 }
  const rate = currentFluidRate(fluid)
  if (mode === "RATE" && delivered <= 0 && rate != null) delivered = (rate * minutes) / 60
  const volume = Math.round(delivered)
  const parts: string[] = []
  if (mode === "VOLUME") {
    const bag = fluid.bagVolumeMl ?? (Number(fluid.volume) || null)
    parts.push(bag != null && volume > 0 && volume !== Math.round(bag)
      ? (ctx.language === "bg" ? `${volume} mL от сак ${Math.round(bag)} mL` : `${volume} mL of a ${Math.round(bag)} mL bag`)
      : `${volume > 0 ? volume : Math.round(bag ?? 0)} mL`)
  } else {
    parts.push(`${volume} mL`)
  }
  parts.push(intraopMinutesLabel(minutes))
  if (mode === "RATE" && rate != null) parts.push(`${Math.round(rate * 10) / 10} mL/h`)
  else if (mode === "VOLUME" && minutes > 0 && volume > 0) parts.push(`≈ ${Math.round((volume * 60) / minutes)} mL/h`)
  return parts.join(" · ")
}

/** An infusion: the amount given and how long it ran. */
export function intraopInfusionTotalLabel(infusion: TimetableInfusion, ctx: RunTotalContext, column = infusion.endCol): string {
  const minutes = runMinutes(infusion, ms(ctx.now), column)
  let amount: string | null
  try { amount = formatInfusionTotal(calcInfusionTotal(infusion, ctx.ibw, ctx.tbw, ctx.weightBasis ?? DEFAULT_INFUSION_WEIGHT_BASIS, ctx.bodySurfaceAreaM2 ?? null, ctx.tciPatient ?? null)) } catch { amount = null }
  return [amount, intraopMinutesLabel(minutes)].filter(Boolean).join(" · ")
}

/**
 * The total for one running item of a row, by the id the row gives it (agent-NAME, inf-ID, fluid-ID,
 * gas-settings, jet...): the PWA's open row. Null where the item cannot be found.
 */
export function intraopRunTotalLabel(timetable: TimetableData, itemId: string, column: number, ctx: RunTotalContext): string | null {
  if (itemId.startsWith("inf-")) {
    const infusion = (timetable.infusions ?? []).find(item => item.id === itemId.slice(4))
    return infusion ? intraopInfusionTotalLabel(infusion, ctx, column) : null
  }
  if (itemId.startsWith("fluid-")) {
    const fluid = (timetable.fluids ?? []).find(item => item.id === itemId.slice(6))
    return fluid ? intraopFluidTotalLabel(fluid, ctx, column) : null
  }
  const timed = (seg: { startCol: number; endCol: number; stopped?: boolean }) => intraopMinutesLabel(runMinutes(seg, ms(ctx.now), column))
  if (itemId.startsWith("agent-")) {
    const name = itemId.slice(6)
    const agent = (timetable.agents ?? []).filter(item => item.name === name && item.startCol <= column).pop()
    return agent ? timed(agent) : null
  }
  if (itemId === "gas-settings") {
    const gas = (timetable.gasSettings ?? []).filter(item => item.startCol <= column).pop()
    return gas ? timed(gas) : null
  }
  if (itemId === "jet" || itemId.startsWith("jet-")) {
    const jet = (timetable.jetSettings ?? []).filter(item => item.startCol <= column).pop()
    return jet ? timed(jet) : null
  }
  return null
}
