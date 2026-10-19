import { INFUSION_SYRINGES, INFUSION_SYRINGES_BY_ROUTE, type SyringeStrength } from "./catalog/infusion-syringes"
import { milligramsPerMillilitre } from "./volume-dose"

/**
 * An infusion has two rates: the dose rate (mcg/kg/min, mg/hr...) and the pump
 * rate (mL/hr). The syringe strength -- so many mg in so many mL -- turns one
 * into the other, and the pump rate over time is the volume the patient was
 * given, which counts in the fluid balance. Decided 2026-10-18: both rates are
 * recorded on every start and change, the syringe step may be skipped (then
 * there is no mL total), and more than one dose unit is offered.
 *
 * Shared by the PWA, the web and the API so the same syringe gives the same
 * pump rate and the same millilitres everywhere.
 */

export type { SyringeStrength } from "./catalog/infusion-syringes"

export const PUMP_RATE_UNIT = "mL/hr"

const MASS_IN_MCG: Readonly<Record<string, number>> = { ng: 0.001, mcg: 1, "µg": 1, ug: 1, mg: 1000, g: 1_000_000 }

/** The strengths offered for a drug on a route: the route's own, else the drug's. */
export function syringeOptions(name: string, route?: string | null): readonly SyringeStrength[] {
  const byRoute = route ? INFUSION_SYRINGES_BY_ROUTE[name]?.[route.toUpperCase()] : undefined
  return byRoute ?? INFUSION_SYRINGES[name] ?? []
}

const trimmed = (value: number) => String(Number(value.toFixed(6)))

/** "4 mg/50 mL": how a strength is shown, recorded and read back. */
export function formatSyringe(strength: SyringeStrength): string {
  return `${trimmed(strength.amount)} ${strength.amountUnit}/${trimmed(strength.volumeMl)} mL`
}

/** A recorded strength label back into its parts; null for anything else (a % or free text). */
export function parseSyringe(label: string | null | undefined): SyringeStrength | null {
  const match = label?.trim().match(/^([0-9]+(?:[.,][0-9]+)?)\s*(ng|mcg|µg|mg|g|IU|mmol|mEq)\s*\/\s*([0-9]+(?:[.,][0-9]+)?)\s*mL$/i)
  if (!match) return null
  const amount = Number(match[1]!.replace(",", "."))
  const volumeMl = Number(match[3]!.replace(",", "."))
  if (!(amount > 0) || !(volumeMl > 0)) return null
  const unit = match[2]!
  const amountUnit = (["IU", "mmol", "mEq"].find(known => known.toLowerCase() === unit.toLowerCase())
    ?? (unit === "µg" ? "mcg" : unit.toLowerCase())) as SyringeStrength["amountUnit"]
  return { amount, amountUnit, volumeMl }
}

type RateUnit = { amountUnit: string; perKg: boolean; perMinute: boolean }

/** "mcg/kg/min" into its parts; null for a volume, per-m² or unreadable unit. */
export function parseDoseRateUnit(unit: string | null | undefined): RateUnit | null {
  const match = unit?.trim().match(/^([A-Za-zµ]+)(\/kg)?\/(min|hr|h)$/i)
  if (!match || /^mL$/i.test(match[1]!)) return null
  return { amountUnit: match[1]!, perKg: !!match[2], perMinute: match[3]!.toLowerCase() === "min" }
}

/** Is this a volume rate (mL/hr, mL/kg/hr) rather than a dose rate? */
export function isVolumeRateUnit(unit: string | null | undefined): boolean {
  return !!unit && /^mL\//i.test(unit.trim())
}

/** How many of `to` make one of `from`, for units that convert (masses), else null. */
function amountFactor(from: string, to: string): number | null {
  if (from.toLowerCase() === to.toLowerCase()) return 1
  const a = MASS_IN_MCG[from === "µg" ? "mcg" : from.toLowerCase()]
  const b = MASS_IN_MCG[to === "µg" ? "mcg" : to.toLowerCase()]
  return a != null && b != null ? a / b : null
}

/** Amount per mL of a strength, in the strength's own unit; a % reads as mg/mL. */
function strengthPerMl(concentration: string | null | undefined): { perMl: number; unit: string } | null {
  const syringe = parseSyringe(concentration)
  if (syringe) return { perMl: syringe.amount / syringe.volumeMl, unit: syringe.amountUnit }
  const mgPerMl = milligramsPerMillilitre(concentration)
  return mgPerMl == null ? null : { perMl: mgPerMl, unit: "mg" }
}

const positiveWeight = (weightKg: number | null | undefined) => weightKg != null && weightKg > 0 ? weightKg : null

/**
 * The pump rate, mL/hr, a rate gives. A volume rate needs only the weight (for
 * mL/kg/hr); a dose rate needs the strength, and the weight when per kg. Null
 * when it cannot be worked out -- never a guess.
 */
export function pumpRateMlPerHour(input: {
  rate: number
  unit: string
  concentration?: string | null
  weightKg?: number | null
}): number | null {
  const { rate, unit } = input
  if (!Number.isFinite(rate) || rate < 0) return null
  const weight = positiveWeight(input.weightKg)
  if (isVolumeRateUnit(unit)) {
    if (/^mL\/hr?$/i.test(unit.trim())) return rate
    if (/^mL\/kg\/hr?$/i.test(unit.trim())) return weight == null ? null : rate * weight
    return null
  }
  const parsed = parseDoseRateUnit(unit)
  const strength = strengthPerMl(input.concentration)
  if (!parsed || !strength) return null
  const factor = amountFactor(parsed.amountUnit, strength.unit)
  if (factor == null || (parsed.perKg && weight == null)) return null
  const perHour = rate * (parsed.perKg ? weight! : 1) * (parsed.perMinute ? 60 : 1) * factor
  return perHour / strength.perMl
}

/** The dose rate, in `unit`, a pump rate gives: the inverse of pumpRateMlPerHour. */
export function doseRateFromPump(input: {
  mlPerHour: number
  unit: string
  concentration?: string | null
  weightKg?: number | null
}): number | null {
  const one = pumpRateMlPerHour({ rate: 1, unit: input.unit, concentration: input.concentration, weightKg: input.weightKg })
  if (one == null || !(one > 0) || !Number.isFinite(input.mlPerHour) || input.mlPerHour < 0) return null
  return input.mlPerHour / one
}

/** Drugs charted both ways, mg/kg/hr and mcg/kg/min (propofol 6 mg/kg/hr = 100 mcg/kg/min). */
const PER_MINUTE_TOO = new Set(["Propofol", "Rocuronium", "Vecuronium", "Cisatracurium", "Atracurium"])

/**
 * The dose units a drug may be entered in (2026-10-18): its own; a per-kg
 * rate also without the kilogram (noradrenaline mcg/min, heparin IU/hr); a
 * flat rate per kg only when it is a mass a drug is weight-dosed in (morphine
 * mg/kg/hr) -- never grams, units, mmol or mEq, where nobody doses per kg; and
 * mcg/kg/min for the drugs charted that way as well. Volume and per-m² units
 * have no alternative.
 */
export function alternativeDoseUnits(unit: string, name?: string | null): string[] {
  const parsed = parseDoseRateUnit(unit)
  if (!parsed) return [unit]
  const time = parsed.perMinute ? "min" : "hr"
  const amount = parsed.amountUnit
  const units = [unit]
  if (parsed.perKg) units.push(`${amount}/${time}`)
  // mcg/kg/min is real (isoprenaline); mg/kg/min is not (labetalol is mg/min or mg/hr).
  else if (["ng", "mcg", "µg"].includes(amount.toLowerCase()) || (amount.toLowerCase() === "mg" && !parsed.perMinute)) units.push(`${amount}/kg/${time}`)
  if (name && PER_MINUTE_TOO.has(name) && unit === "mg/kg/hr") units.push("mcg/kg/min")
  return units
}

/** A dose rate in another of its units; null when it needs a weight that is missing. */
export function convertDoseRate(rate: number, from: string, to: string, weightKg?: number | null): number | null {
  if (from === to) return rate
  const a = parseDoseRateUnit(from)
  const b = parseDoseRateUnit(to)
  if (!a || !b) return null
  const factor = amountFactor(a.amountUnit, b.amountUnit)
  if (factor == null) return null
  const weight = positiveWeight(weightKg)
  if (a.perKg !== b.perKg && weight == null) return null
  const perKgFactor = a.perKg === b.perKg ? 1 : a.perKg ? weight! : 1 / weight!
  // Per minute to per hour and back.
  const timeFactor = a.perMinute === b.perMinute ? 1 : a.perMinute ? 60 : 1 / 60
  return rate * factor * perKgFactor * timeFactor
}

/** Rounded for the screen and the record: three significant decimals, no float dust. */
export function roundRate(value: number): number {
  if (!Number.isFinite(value)) return value
  const magnitude = Math.abs(value)
  const decimals = magnitude >= 100 ? 1 : magnitude >= 1 ? 2 : 3
  return Number(value.toFixed(decimals))
}

export type InfusionVolumeLike = {
  startTs?: string
  endTs?: string
  planned?: boolean
  volumeRateMlPerHour?: number
  rateChanges?: { ts?: string; planned?: boolean; volumeRateMlPerHour?: number }[]
}

function instant(value: string | Date | number | undefined): number | null {
  if (value == null) return null
  const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

/**
 * The millilitres an infusion has given, to 0.1 mL: its pump rate over the
 * time it ran, through every rate change. Null when any running stretch has no
 * pump rate (the syringe was skipped, or a change was saved without one) --
 * a partial volume would read as the whole -- or the times are unknown.
 */
export function infusionVolumeMl(infusion: InfusionVolumeLike, asOf: Date | string | number = new Date()): number | null {
  if (infusion.planned) return 0
  const start = instant(infusion.startTs)
  const end = instant(infusion.endTs) ?? instant(asOf)
  if (start == null || end == null) return null
  const stretches: { from: number; rate: number | undefined }[] = [{ from: start, rate: infusion.volumeRateMlPerHour }]
  for (const change of [...(infusion.rateChanges ?? [])].filter(item => !item.planned)) {
    const at = instant(change.ts)
    if (at == null) return null
    stretches.push({ from: at, rate: change.volumeRateMlPerHour })
  }
  stretches.sort((a, b) => a.from - b.from)
  let total = 0
  for (const [index, stretch] of stretches.entries()) {
    const until = Math.min(end, stretches[index + 1]?.from ?? end)
    if (until <= stretch.from) continue
    if (stretch.rate == null || !Number.isFinite(stretch.rate) || stretch.rate < 0) return null
    total += stretch.rate * (until - stretch.from) / 3_600_000
  }
  return Math.round(total * 10) / 10
}

/**
 * Each drug's infused millilitres, summed over its infusions; null for a drug
 * any of whose infusions ran without a pump rate (a partial sum would read as
 * the whole). Planned infusions count for nothing.
 */
export function infusionVolumesByName(
  infusions: readonly (InfusionVolumeLike & { name: string })[],
  asOf: Date | string | number = new Date(),
): Map<string, number | null> {
  const byName = new Map<string, number | null>()
  for (const infusion of infusions) {
    if (infusion.planned) continue
    const volume = infusionVolumeMl(infusion, asOf)
    const sum = byName.has(infusion.name) ? byName.get(infusion.name)! : 0
    byName.set(infusion.name, sum == null || volume == null ? null : Math.round((sum + volume) * 10) / 10)
  }
  return byName
}

/**
 * The units a typed syringe's amount may be in for a drug dosed in `doseUnit`:
 * those that convert to it, the usual one first (noradrenaline syringes are
 * made up in mg though dosed in mcg). None for a volume or per-m² rate.
 */
export function syringeAmountUnits(doseUnit: string): SyringeStrength["amountUnit"][] {
  const parsed = parseDoseRateUnit(doseUnit)
  if (!parsed) return []
  const amount = parsed.amountUnit.toLowerCase()
  if (amount === "iu") return ["IU"]
  if (amount === "mmol") return ["mmol"]
  if (amount === "meq") return ["mEq"]
  if (amount === "ng") return ["mcg", "mg", "ng"]
  if (amount === "g") return ["g", "mg"]
  if (amount === "mcg" || amount === "µg" || amount === "ug") return ["mg", "mcg"]
  if (amount === "mg") return ["mg", "g", "mcg"]
  return []
}

export type SyringeEntryError = "amount" | "volume" | "unit"

/** Largest syringe or bag a strength is typed for. */
export const SYRINGE_MAX_VOLUME_ML = 1000

/**
 * A syringe typed with Other: its label when it can be used, else what is
 * wrong with it -- so the screen says why rather than quietly saving the
 * infusion without a strength.
 */
export function customSyringe(input: {
  amount: string | number
  amountUnit: string | null | undefined
  volumeMl: string | number
  doseUnit: string
}): { label: string; strength: SyringeStrength } | { error: SyringeEntryError } {
  const number = (value: string | number) => typeof value === "number" ? value : Number(String(value).trim().replace(",", "."))
  const amount = number(input.amount)
  const volumeMl = number(input.volumeMl)
  if (String(input.amount).trim() === "" || !Number.isFinite(amount) || amount <= 0) return { error: "amount" }
  const allowed = syringeAmountUnits(input.doseUnit)
  const amountUnit = allowed.find(unit => unit.toLowerCase() === (input.amountUnit ?? "").toLowerCase())
  if (!amountUnit) return { error: "unit" }
  if (String(input.volumeMl).trim() === "" || !Number.isFinite(volumeMl) || volumeMl <= 0 || volumeMl > SYRINGE_MAX_VOLUME_ML) return { error: "volume" }
  const strength = { amount, amountUnit, volumeMl }
  return { label: formatSyringe(strength), strength }
}

export type SyringeFieldSurface = { min: number; max: number; step: number; quickValues: number[]; prefill: number }

/** Generic amounts per unit, for a drug with no syringe presets. */
const GENERIC_AMOUNTS: Readonly<Record<string, number[]>> = {
  ng: [100, 500, 1000, 5000], mcg: [50, 100, 500, 1000, 5000], mg: [1, 5, 10, 50, 100, 500], g: [1, 2, 5, 10],
  IU: [10, 50, 100, 1000, 25000], mmol: [10, 20, 40, 50], mEq: [25, 50, 100],
}
const SYRINGE_VOLUMES = [10, 20, 50, 100, 250, 500]

/** A slider step that suits the range: about 200 steps, rounded to 1, 2 or 5. */
function fieldStep(max: number): number {
  const raw = max / 200
  const power = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / power
  return Number(((fraction > 5 ? 10 : fraction > 2 ? 5 : fraction > 1 ? 2 : 1) * power).toPrecision(6))
}

/**
 * The sliders for a syringe typed with Other (2026-10-18): the amount in the
 * unit picked and the volume in mL, each with a range, a prefill and one-tap
 * values from the drug's own syringes -- so Other is entered like any dose.
 */
export function customSyringeFields(input: {
  name: string
  route?: string | null
  amountUnit: SyringeStrength["amountUnit"]
}): { amount: SyringeFieldSurface; volume: SyringeFieldSurface } {
  const presets = syringeOptions(input.name, input.route)
  const inUnit = presets
    .map(preset => {
      const factor = amountFactor(preset.amountUnit, input.amountUnit)
      return factor == null ? null : Number((preset.amount * factor).toPrecision(6))
    })
    .filter((value): value is number => value != null && value > 0)
  const quick = [...new Set(inUnit.length ? inUnit : GENERIC_AMOUNTS[input.amountUnit] ?? [1, 10, 100])].sort((a, b) => a - b)
  const amountMax = Number((Math.max(...quick) * 4).toPrecision(6))
  const volumes = [...new Set([...presets.map(preset => preset.volumeMl), ...SYRINGE_VOLUMES])].sort((a, b) => a - b)
  const usualVolume = presets[0]?.volumeMl ?? 50
  return {
    amount: { min: 0, max: amountMax, step: fieldStep(amountMax), quickValues: quick, prefill: quick[Math.floor((quick.length - 1) / 2)]! },
    volume: { min: 0, max: SYRINGE_MAX_VOLUME_ML, step: 1, quickValues: volumes, prefill: usualVolume },
  }
}
