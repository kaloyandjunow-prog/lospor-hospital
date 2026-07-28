export type DoseRule = {
  perKg?: number
  flat?: number
  basis?: string
  roundTo?: number
  cap?: number
}

export type DoseEntry = DoseRule & {
  hint?: string
  byRoute?: Record<string, DoseRule>
}

export type Patient = {
  weightKg?: number | null
  heightCm?: number | null
  sex?: string | null
}

export function idealBodyWeightKg(heightCm?: number | null, sex?: string | null): number | null {
  if (!heightCm) return null
  const inches = heightCm / 2.54
  if (inches < 60) return null
  const base = sex?.toUpperCase() === "FEMALE" ? 45.5 : 50
  return base + 2.3 * (inches - 60)
}

export function dosingWeightKg(basis: string | undefined, ibw: number | null, tbw: number | null): number | null {
  if (basis === "TBW") return tbw ?? ibw
  if (ibw !== null && tbw !== null) return Math.min(ibw, tbw)
  return ibw ?? tbw
}

export function suggestedDoseFromWeights(
  entry: DoseEntry | undefined,
  route: string | undefined,
  ibw: number | null,
  tbw: number | null,
): { dose: string; hint: string } {
  const hint = entry?.hint ?? ""
  if (!entry) return { dose: "", hint }
  const dc: DoseRule = route && entry.byRoute?.[route] ? entry.byRoute[route] : entry
  if (dc.flat !== undefined) return { dose: String(dc.flat), hint }
  if (dc.perKg !== undefined) {
    const w = dosingWeightKg(dc.basis, ibw, tbw)
    if (!w) return { dose: "", hint }
    const roundTo = dc.roundTo ?? 1
    let dose = Math.round((w * dc.perKg) / roundTo) * roundTo
    if (dc.cap != null) dose = Math.min(dose, dc.cap)
    return { dose: String(dose), hint }
  }
  return { dose: "", hint }
}

export function calcSuggestedDose(
  entry: DoseEntry | undefined,
  route: string | undefined,
  patient: Patient,
): { dose: string; hint: string } {
  return suggestedDoseFromWeights(entry, route, idealBodyWeightKg(patient.heightCm, patient.sex), patient.weightKg ?? null)
}
