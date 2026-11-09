import type { DrugFormulation } from "@/lib/intraop-log-event"

export type Range = { min: number; max: number; step: number }

export type DoseSurface = Range & {
  mode?: string
  quickValues: number[]
  unit: string
  concentrationOptions?: string[]
  suggestedConcentration?: string
  defaultConcentration?: string
  suggestedVolume?: number
  suggestedVolumeByRoute?: Record<string, number>
  formulationOptions?: DrugFormulation[]
  defaultFormulation?: DrugFormulation
}

export function fallbackRange(unit: string): Range {
  if (unit === "mcg") return { min: 0, max: 2000, step: 10 }
  if (unit === "g") return { min: 0, max: 10, step: 0.5 }
  if (unit === "ml" || unit === "mL") return { min: 0, max: 100, step: 1 }
  if (unit === "IU") return { min: 0, max: 200, step: 5 }
  return { min: 0, max: 500, step: 5 }
}

export type Calc = { perKg?: number; flat?: number; basis?: string; roundTo?: number; cap?: number }
export type DoseCalc = Calc & { hint: string; byRoute?: Record<string, Calc> }

/** Step and ceiling of the pediatric dose slider: the profile's rounding and maximum, never less than twice the amount shown or ten steps. */
export function pediatricSliderLimits(profile: { roundTo?: number | null; maximumAmount?: number | null } | null | undefined, amount: number | null | undefined, unit: string) {
  const step = profile?.roundTo ?? (unit === "mcg" ? 1 : 0.1)
  return { step, max: Math.max(profile?.maximumAmount ?? 0, amount != null ? amount * 2 : 0, step * 10) }
}
