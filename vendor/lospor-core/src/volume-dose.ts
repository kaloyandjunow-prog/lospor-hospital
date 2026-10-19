import type { DoseLimit } from "./catalog/dose-profile"

/**
 * Local anaesthetic infusions are set in volume -- mL/kg/hr for a child, mL/hr
 * for an adult -- because the volume decides the spread of the block. What is
 * safe is the dose, and the dose follows from the volume and the strength
 * chosen. These are the conversions between the three numbers on the sheet:
 * the volume rate entered, the pump rate (mL/hr) and the dose rate.
 *
 * Shared by the PWA and the web so the same strength gives the same limit.
 */

/** mg per mL of a strength label: "0.2%" is 2 mg/mL. Null when it cannot be read. */
export function milligramsPerMillilitre(concentration: string | null | undefined): number | null {
  const match = concentration?.trim().match(/^([0-9]+(?:[.,][0-9]+)?)\s*(%|mg\/mL|mcg\/mL)$/i)
  if (!match) return null
  const value = Number(match[1]!.replace(",", "."))
  if (!Number.isFinite(value) || value <= 0) return null
  const unit = match[2]!.toLowerCase()
  return unit === "%" ? value * 10 : unit === "mg/ml" ? value : value / 1000
}

const perKg = (unit: string) => /\/kg\//i.test(unit)

/** Rounded to the slider step without floating-point dust. */
function toStep(value: number, step: number, round: (value: number) => number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1)
  return Number((round(value / step) * step).toFixed(decimals))
}

export type VolumeRateSurface = {
  max: number
  quickValues: number[]
  /** The volume rate suggested for this strength, when the limit has one. */
  suggestedRate?: number
}

/**
 * The slider for a volume route at the chosen strength. With a dose limit and
 * a readable strength, the maximum is the most volume that keeps under the
 * dose limit (never above the authored maximum), quick pills above it are
 * dropped, and the suggestion is the suggested dose as volume. Without either,
 * the authored surface stands.
 */
export function volumeRateSurface(input: {
  max: number
  step: number
  quickValues: readonly number[]
  doseLimit?: DoseLimit
  concentration?: string | null
}): VolumeRateSurface {
  const mgPerMl = milligramsPerMillilitre(input.concentration)
  if (!input.doseLimit || mgPerMl == null) return { max: input.max, quickValues: [...input.quickValues] }
  const max = Math.min(input.max, toStep(input.doseLimit.max / mgPerMl, input.step, Math.floor))
  const suggested = input.doseLimit.suggested
  return {
    max,
    quickValues: input.quickValues.filter(value => value <= max),
    ...(suggested == null ? {} : { suggestedRate: Math.min(max, toStep(suggested / mgPerMl, input.step, Math.round)) }),
  }
}

export type VolumeRateReadout = {
  /** What the pump is set to, mL/hr; only when the weight is known for a per-kg rate. */
  pumpMlPerHour: number | null
  /** The dose the volume delivers, in mg/kg/hr or mg/hr; null without a readable strength. */
  doseRate: { value: number; unit: string } | null
}

/** The pump rate and dose rate a volume rate gives, for the readout beside the slider. */
export function volumeRateReadout(input: {
  rate: number
  unit: string
  concentration?: string | null
  weightKg?: number | null
}): VolumeRateReadout {
  const { rate, unit } = input
  if (!Number.isFinite(rate) || rate < 0) return { pumpMlPerHour: null, doseRate: null }
  const weight = input.weightKg != null && input.weightKg > 0 ? input.weightKg : null
  const pumpMlPerHour = perKg(unit)
    ? (weight == null ? null : Math.round(rate * weight * 10) / 10)
    : Math.round(rate * 10) / 10
  const mgPerMl = milligramsPerMillilitre(input.concentration)
  return {
    pumpMlPerHour,
    doseRate: mgPerMl == null
      ? null
      : { value: Math.round(rate * mgPerMl * 1000) / 1000, unit: perKg(unit) ? "mg/kg/hr" : "mg/hr" },
  }
}

/**
 * The per-kg volume rate for a pump rate read off the pump. Kept to three
 * decimals so the pump rate shown back is the one typed, not one moved by
 * rounding to the slider step.
 */
export function volumeRateFromPump(pumpMlPerHour: number, weightKg: number | null | undefined): number | null {
  if (!Number.isFinite(pumpMlPerHour) || pumpMlPerHour < 0 || weightKg == null || !(weightKg > 0)) return null
  return Math.round((pumpMlPerHour / weightKg) * 1000) / 1000
}

/** True for a per-kg volume rate, where the pump rate differs from the rate entered. */
export function isPerKgVolumeRate(unit: string | null | undefined): boolean {
  return !!unit && /^mL\/kg\//i.test(unit.trim())
}
