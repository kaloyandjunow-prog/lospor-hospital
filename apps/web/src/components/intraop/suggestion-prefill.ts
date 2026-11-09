import { convertDoseAmount } from "@lospor/core/intraop-suggestions"
import type { TtFP } from "./timetable-types"

/**
 * A suggestion's prefill laid onto the chart's own dosing sheet (10.2.0).
 *
 * The sheet opens as it always would -- the ruleset's dose, its quick values,
 * its routes -- and a suggestion with a number of its own replaces only the
 * dose. A number is never moved across units it cannot be converted between:
 * 50 mcg in a sheet that speaks mg becomes 0.05 mg, and a dose the sheet's
 * unit cannot express leaves the sheet's own dose standing rather than
 * putting "50" beside the wrong unit.
 */

export { convertDoseAmount }

/** The infusions a "Deepen anaesthesia" row offers to turn up, besides a running volatile. */
export const DEEPEN_INFUSIONS: ReadonlySet<string> = new Set(["Propofol", "Remifentanil", "Sufentanil", "Dexmedetomidine"])

export function suggestionPrefill(
  fp: TtFP,
  prefill: { amount: number | "catalogue" | null; unit?: string; route?: string },
  suggestion: string,
): TtFP {
  const next: TtFP = { ...fp, suggestion }
  if (prefill.route && (fp.routes ?? []).includes(prefill.route)) next.route = prefill.route
  if (typeof prefill.amount !== "number") return next
  if (fp.mode === "infusion") {
    const unit = prefill.unit ?? fp.rateUnit
    if (unit === fp.rateUnit) next.rate = prefill.amount
    else if (fp.rateUnits.includes(unit)) { next.rate = prefill.amount; next.rateUnit = unit }
    return next
  }
  const amount = convertDoseAmount(prefill.amount, prefill.unit ?? fp.unit, fp.unit)
  if (amount != null) next.dose = String(amount)
  return next
}

export function suggestionFluidPrefill(
  fp: TtFP,
  prefill: { amount: number | "catalogue" | null; mode?: "VOLUME" | "RATE"; concentration?: string },
  suggestion: string,
): TtFP {
  const next: TtFP = { ...fp, suggestion }
  const modes = fp.fluidEntryModes ?? [fp.fluidEntryMode ?? "VOLUME"]
  const mode = prefill.mode && modes.includes(prefill.mode) ? prefill.mode : fp.fluidEntryMode
  if (mode) next.fluidEntryMode = mode
  if (prefill.concentration && (fp.fluidConcentrations ?? []).includes(prefill.concentration)) next.concentration = prefill.concentration
  if (typeof prefill.amount !== "number") return next
  if (mode === "RATE") next.fluidRate = String(prefill.amount)
  else next.dose = String(prefill.amount)
  return next
}

/**
 * The fluid for a row that names a kind rather than a fluid ("crystalloid"):
 * the last of that kind on the chart, else the first in the library.
 */
export function suggestionFluidFor(
  category: string | undefined,
  charted: readonly { name: string; category?: string }[],
  library: readonly { label: string; group?: string | null }[],
): string | null {
  if (!category) return null
  const used = [...charted].reverse().find(fluid => fluid.category === category)
  return used?.name ?? library.find(option => option.group === category)?.label ?? null
}
