/**
 * Premedication as a coded drug, like an intraoperative dose.
 *
 * It was saved as a line of text per phase ("Midazolam 7.5 mg PO; Paracetamol
 * 1000 mg PO"), which the research copy could not split into drug, dose and
 * route: every premedication exported research code 0. The pickers on web and
 * mobile write each entry in one fixed shape -- the catalogue name, the dose,
 * the unit, the route -- so an entry reads back exactly into a drug with its
 * ATC code, and so its research code.
 *
 * A premedication has no clock time, only when it was given relative to the
 * operation: the day before, or the morning before surgery.
 */

import {
  PREMED_ATC_CODES,
  PREMED_DOSES,
  premedRouteHint,
  type PremedRouteDose,
} from "./catalog/premed-drugs"

export type PremedicationPhase = "DAY_BEFORE" | "MORNING"

export const PREMEDICATION_PHASES: Readonly<Record<PremedicationPhase, {
  en: string
  bg: string
  /** Days from the day of surgery, for dating the administration. */
  dayOffset: number
}>> = {
  DAY_BEFORE: { en: "The night before surgery", bg: "Вечерта преди операцията", dayOffset: -1 },
  MORNING: { en: "The morning of surgery", bg: "Сутринта в деня на операцията", dayOffset: 0 },
}

/** What the "not applicable" button writes for a phase in which nothing was given. */
export const PREMEDICATION_NOT_GIVEN = "N/A"

/** The phase a stored value names, including the "evening" earlier records used. */
export function premedicationPhaseOf(value: unknown): PremedicationPhase | null {
  const text = typeof value === "string" ? value.trim().toUpperCase().replace(/[\s-]+/g, "_") : ""
  if (text === "DAY_BEFORE" || text === "EVENING") return "DAY_BEFORE"
  if (text === "MORNING") return "MORNING"
  return null
}

export type PremedicationItem = {
  phase: PremedicationPhase
  /** The entry as written, kept whole so nothing a clinician recorded is lost. */
  entry: string
  /** The catalogue drug, or null when the entry names none. */
  drug: string | null
  atcCode: string | null
  dose: number | null
  unit: string | null
  route: string | null
}

const DRUG_NAMES = Object.keys(PREMED_DOSES).sort((a, b) => b.length - a.length)

/** A premedication drug's ATC code, by its catalogue name. */
export function premedicationAtcCode(drug: string | null | undefined): string | null {
  if (!drug) return null
  const name = DRUG_NAMES.find(candidate => candidate.toLowerCase() === drug.trim().toLowerCase())
  return name ? PREMED_ATC_CODES[name] ?? null : null
}

/**
 * The drugs one phase's text records, in order.
 *
 * The longest catalogue name the entry starts with is the drug ("Sodium citrate"
 * before any shorter name), and the rest reads as dose, unit and route. An
 * entry naming no catalogue drug is kept with drug and code null, never
 * guessed at.
 */
export function parsePremedicationEntries(text: string | null | undefined, phase: PremedicationPhase): PremedicationItem[] {
  if (!text) return []
  return text.split(";").map(part => part.trim()).filter(part => part && part !== PREMEDICATION_NOT_GIVEN).map(entry => {
    const lower = entry.toLowerCase()
    const drug = DRUG_NAMES.find(name => lower === name.toLowerCase() || lower.startsWith(`${name.toLowerCase()} `)) ?? null
    const rest = drug ? entry.slice(drug.length).trim() : ""
    const match = rest.match(/^(\d+(?:[.,]\d+)?)\s+(\S+)(?:\s+(.+))?$/)
    return {
      phase,
      entry,
      drug,
      atcCode: drug ? PREMED_ATC_CODES[drug] ?? null : null,
      dose: match ? Number(match[1].replace(",", ".")) : null,
      unit: match ? match[2] : null,
      route: match?.[3]?.trim() || null,
    }
  })
}

// ── Premedication ordered at the preop visit (1.7.0) ─────────────────────

/**
 * The premedication the anaesthetist orders at the preop visit, per phase, in
 * the picker's own words ("Midazolam 7.5 mg PO; Pantoprazole 40 mg PO"): the
 * same shape the intraoperative record keeps, so the order carries straight
 * into it. A phase left out of a save is left as it is; an empty one clears it.
 */
export type PremedicationOrders = Partial<Record<PremedicationPhase, string | null>>

export const PREMEDICATION_ORDER_PHASES: Readonly<Record<PremedicationPhase, { en: string; bg: string }>> = {
  DAY_BEFORE: { en: "The night before surgery", bg: "Вечерта преди операцията" },
  MORNING: { en: "The morning of surgery", bg: "Сутринта в деня на операцията" },
}

export const MAX_PREMEDICATION_ENTRIES = 20
export const MAX_PREMEDICATION_ENTRY_LENGTH = 200

/** One phase's entries, in order; "not applicable" is not an entry. */
export function premedicationEntries(text: string | null | undefined): string[] {
  if (typeof text !== "string") return []
  return text.split(";").map(part => part.trim()).filter(part => part && part !== PREMEDICATION_NOT_GIVEN)
}

export type PremedicationOrderProblem =
  | { code: "TOO_MANY_ENTRIES"; phase: PremedicationPhase }
  | { code: "ENTRY_TOO_LONG"; phase: PremedicationPhase }
  | { code: "UNKNOWN_PHASE"; phase: string }

export function premedicationOrderProblems(orders: Record<string, unknown>): PremedicationOrderProblem[] {
  const problems: PremedicationOrderProblem[] = []
  for (const [phase, text] of Object.entries(orders)) {
    if (phase !== "DAY_BEFORE" && phase !== "MORNING") { problems.push({ code: "UNKNOWN_PHASE", phase }); continue }
    const entries = premedicationEntries(typeof text === "string" ? text : null)
    if (entries.length > MAX_PREMEDICATION_ENTRIES) problems.push({ code: "TOO_MANY_ENTRIES", phase })
    if (entries.some(entry => entry.length > MAX_PREMEDICATION_ENTRY_LENGTH)) problems.push({ code: "ENTRY_TOO_LONG", phase })
  }
  return problems
}

/**
 * What a phase of the intraoperative record starts with: the preop order,
 * while the phase is still empty. A phase anyone has filled, or marked not
 * applicable, is never overwritten. Null: nothing to fill.
 */
export function premedicationPrefill(current: string | null | undefined, ordered: string | null | undefined): string | null {
  if (typeof current === "string" && current.trim()) return null
  const entries = premedicationEntries(ordered)
  return entries.length > 0 ? entries.join("; ") : null
}

/** Whether a phase of the record still holds exactly what was ordered. */
export function isPremedicationAsOrdered(current: string | null | undefined, ordered: string | null | undefined): boolean {
  const ordered_ = premedicationEntries(ordered)
  const current_ = premedicationEntries(current)
  return ordered_.length > 0 && ordered_.length === current_.length && ordered_.every((entry, index) => entry === current_[index])
}

/**
 * The date a premedication was given, from the day of surgery (YYYY-MM-DD):
 * the day before is D-1, the morning before surgery is D.
 */
export function premedicationDate(surgeryDate: string | null | undefined, phase: PremedicationPhase): string | null {
  if (!surgeryDate || !/^\d{4}-\d{2}-\d{2}/.test(surgeryDate)) return null
  const day = new Date(`${surgeryDate.slice(0, 10)}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + PREMEDICATION_PHASES[phase].dayOffset)
  return day.toISOString().slice(0, 10)
}

export type AdultPremedDose = {
  /**
   * "suggested": prefill `dose`. "as-prescribed": a home medicine, the box
   * starts empty. "needs-weight": weight-based and no weight is recorded, so
   * the box starts empty. "unknown": no rule for this drug and route.
   */
  status: "suggested" | "as-prescribed" | "needs-weight" | "unknown"
  /** Always in `unit`; a weight-based dose is already calculated. */
  dose: number | null
  unit: string
  min: number
  max: number
  step: number
  hint: string
}

function roundToStep(value: number, step: number): number {
  const decimals = step < 1 ? 1 : 0
  return Number((Math.round(value / step) * step).toFixed(decimals))
}

/**
 * The adult dose for a premedication drug by a route. A route change replaces
 * the dose with this, even a dose typed by hand: oral and intravenous doses of
 * the same drug differ up to tenfold.
 *
 * Reads the per-route values from the library row when it carries them and
 * falls back to the bundled table by name, so a library seeded before 1.4.9
 * still gets per-route doses.
 */
export function adultPremedDoseForRoute(
  drug: string | { name: string; routeDoses?: Record<string, PremedRouteDose> },
  route: string,
  weightKg?: number | null,
): AdultPremedDose {
  const name = typeof drug === "string" ? drug : drug.name
  const routeDoses = (typeof drug === "string" ? undefined : drug.routeDoses) ?? PREMED_DOSES[name]?.routeDoses
  const rule = routeDoses?.[route]
  if (!rule) return { status: "unknown", dose: null, unit: "", min: 0, max: 0, step: 1, hint: "" }
  const hint = premedRouteHint(route, rule)
  if (rule.perKg) {
    const weight = typeof weightKg === "number" && Number.isFinite(weightKg) && weightKg > 0 ? weightKg : null
    if (weight === null || rule.dose == null) {
      return { status: "needs-weight", dose: null, unit: rule.unit, min: 0, max: 0, step: 1, hint }
    }
    // The dose recorded is the calculated amount, never "mg/kg" text.
    const min = Math.ceil(rule.min * weight)
    const max = Math.floor(rule.max * weight)
    const dose = Math.min(max, Math.max(min, roundToStep(rule.dose * weight, 1)))
    return { status: "suggested", dose, unit: rule.unit, min, max, step: 1, hint: `${hint} = ${dose} ${rule.unit}` }
  }
  if (rule.dose == null) {
    return { status: "as-prescribed", dose: null, unit: rule.unit, min: rule.min, max: rule.max, step: rule.step, hint }
  }
  return { status: "suggested", dose: rule.dose, unit: rule.unit, min: rule.min, max: rule.max, step: rule.step, hint }
}
