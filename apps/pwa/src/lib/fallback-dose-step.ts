/**
 * The step of the − and + buttons where a dose has no range to guide it (the
 * hospital's guidance is off, a drug found only by search, rules not loaded).
 * One tap moves by a unit a clinician would say aloud; a long press repeats.
 * Unknown units get 1.
 */
export function fallbackDoseStep(unit: string | undefined | null): number {
  const normal = (unit ?? "").trim().toLowerCase().replace("µ", "u").replace("μ", "u")
  const per = normal.split("/")[0] ?? ""
  if (per === "mcg" || per === "ug") return 10
  if (per === "ng") return 10
  if (per === "ml") return 5
  if (per === "mg") return 1
  if (per === "g") return 0.5
  if (per === "meq" || per === "mmol") return 1
  if (per === "iu" || per === "u" || per === "units" || per === "unit") return 1
  return 1
}

/** The largest value the in-app keypad accepts where no range exists. */
export const FALLBACK_DOSE_CEILING = 100000
