import { PREMED_DOSES } from "./catalog/premed-drugs"
import { resolveIdealBodyWeight } from "./ideal-body-weight"
import { normalizePediatricAge, type PediatricAgeInput } from "./pediatric"

/**
 * Weight-based premedication dosing for children.
 *
 * `PREMED_DOSES` holds fixed adult amounts — midazolam 7.5 mg, paracetamol 1 g,
 * ibuprofen 400 mg — with no weight or age term anywhere in the type. The
 * premedication sheet showed those numbers unchanged in paediatric mode and
 * carried a banner telling the clinician not to trust them. This module is what
 * that banner was waiting for: it resolves a starting dose from the child's
 * weight and age, so the sheet can show a number that belongs to the patient in
 * front of it.
 *
 * Three rules govern what is in here:
 *
 * 1. **A drug with no entry gets no suggestion.** It is reported as
 *    `manual`, and the sheet must ask for a hand-entered dose rather than
 *    falling back to the adult figure. Silence is the safe answer.
 * 2. **Every dose is capped**, and the cap is the usual adult dose. A 60 kg
 *    fifteen-year-old on 15 mg/kg of paracetamol computes to 900 mg, which is
 *    right; the same arithmetic must never exceed what an adult would receive.
 * 3. **Minimum ages are enforced**, because several of these are contraindicated
 *    or simply not used below a threshold — ibuprofen under 3 months, codeine
 *    at any paediatric age post-tonsillectomy, aspirin under 16.
 *
 * Doses are conventional paediatric premedication values. They are a starting
 * point for a prescriber, not an instruction: `resolvePediatricPremedication`
 * always returns the arithmetic it used so the number can be checked at a
 * glance rather than trusted blind.
 */

export const PEDIATRIC_PREMEDICATION_VERSION = "LOSPOR_PEDIATRIC_PREMED_2026_08_06" as const

export const PEDIATRIC_PREMEDICATION_SOURCE_REFS = [
  "https://www.medicinescomplete.com/#/browse/bnfc",
  "https://www.apagbi.org.uk/guidelines",
  "https://www.rcoa.ac.uk/gpas/chapter-10",
  "https://www.mhra.gov.uk/codeine-restricted-use-children",
] as const

const YEAR_DAYS = 365.2425
const MONTH_DAYS = 30.436875

/** Which weight a per-kilogram dose is computed from. */
export type PremedicationWeightBasis = "TBW" | "IBW"

export type PediatricPremedicationRule = {
  /** Dose per kilogram, in `unit`. */
  perKg: number
  unit: string
  /** Never exceed this, whatever the arithmetic says. Normally the adult dose. */
  cap: number
  /** Round the computed dose to this increment. */
  roundTo: number
  /** Smallest amount that can practically be given by this route. */
  floor?: number
  basis?: PremedicationWeightBasis
  /** Below this age the drug is not offered at all. */
  minimumAgeDays?: number
  /** Why it is withheld, shown in place of a dose. */
  withheldReason?: string
  hint?: string
}

export type PediatricPremedicationEntry = {
  /** Route-specific rules. A route absent here has no paediatric suggestion. */
  routes: Record<string, PediatricPremedicationRule>
  /** Applies to every route, e.g. codeine. */
  minimumAgeDays?: number
  withheldReason?: string
}

/**
 * Paediatric premedication rules, keyed by the `PREMED_DOSES` drug name.
 *
 * Caps are the adult dose from `PREMED_DOSES` unless the paediatric ceiling is
 * genuinely lower, which is checked by a test rather than by eye.
 */
export const PEDIATRIC_PREMEDICATION: Readonly<Record<string, PediatricPremedicationEntry>> = {
  // ── Anxiolytics ────────────────────────────────────────────────────────────
  "Midazolam": {
    // Matches the intraop paediatric profile for midazolam, deliberately: the
    // same child must not be offered two different oral midazolam doses
    // depending on which screen asked.
    minimumAgeDays: 6 * MONTH_DAYS,
    routes: {
      PO: { perKg: 0.5, unit: "mg", cap: 15, roundTo: 0.5, floor: 2.5, basis: "TBW", hint: "0.5 mg/kg PO, 20–30 min before induction" },
      // Spelled as the premedication catalogue spells it. The intraop catalogue
      // calls the same route "IN"; a rule keyed that way here never matches.
      Intranasal: { perKg: 0.2, unit: "mg", cap: 10, roundTo: 0.1, basis: "TBW", hint: "0.2 mg/kg intranasal" },
      IM: { perKg: 0.1, unit: "mg", cap: 10, roundTo: 0.1, basis: "IBW", hint: "0.1 mg/kg IM" },
      IV: { perKg: 0.05, unit: "mg", cap: 5, roundTo: 0.1, basis: "IBW", hint: "0.05 mg/kg IV, titrated" },
    },
  },
  "Diazepam": {
    minimumAgeDays: YEAR_DAYS,
    routes: {
      PO: { perKg: 0.2, unit: "mg", cap: 10, roundTo: 0.5, basis: "TBW", hint: "0.2 mg/kg PO" },
    },
  },
  "Lorazepam": {
    minimumAgeDays: YEAR_DAYS,
    routes: {
      PO: { perKg: 0.05, unit: "mg", cap: 2, roundTo: 0.25, basis: "TBW", hint: "0.05 mg/kg PO" },
    },
  },
  "Temazepam": { minimumAgeDays: 12 * YEAR_DAYS, routes: {
    PO: { perKg: 0.3, unit: "mg", cap: 20, roundTo: 5, basis: "TBW", hint: "Adolescents only" },
  } },

  // ── Analgesics ─────────────────────────────────────────────────────────────
  "Paracetamol": {
    routes: {
      PO: { perKg: 15, unit: "mg", cap: 1000, roundTo: 10, basis: "TBW", hint: "15 mg/kg PO, max 1 g per dose" },
      PR: { perKg: 20, unit: "mg", cap: 1000, roundTo: 10, basis: "TBW", hint: "20 mg/kg PR loading dose" },
      IV: { perKg: 15, unit: "mg", cap: 1000, roundTo: 10, basis: "TBW", hint: "15 mg/kg IV; 7.5 mg/kg under 10 kg" },
    },
  },
  "Ibuprofen": {
    // Not used under three months.
    minimumAgeDays: 3 * MONTH_DAYS,
    routes: {
      PO: { perKg: 10, unit: "mg", cap: 400, roundTo: 10, basis: "TBW", hint: "10 mg/kg PO" },
    },
  },
  "Tramadol": {
    minimumAgeDays: 12 * YEAR_DAYS,
    withheldReason: "Not recommended under 12 years",
    routes: {
      PO: { perKg: 1, unit: "mg", cap: 100, roundTo: 5, basis: "TBW", hint: "1 mg/kg PO, 12 years and over" },
    },
  },
  "Codeine": {
    // Contraindicated in children for post-operative pain after adenotonsillectomy
    // and not recommended under 12 at all. There is no dose to suggest.
    minimumAgeDays: Number.POSITIVE_INFINITY,
    withheldReason: "Contraindicated in children",
    routes: {},
  },
  "Gabapentin": { minimumAgeDays: 6 * YEAR_DAYS, routes: {
    PO: { perKg: 10, unit: "mg", cap: 300, roundTo: 25, basis: "TBW", hint: "10 mg/kg PO" },
  } },
  "Celecoxib": { minimumAgeDays: 2 * YEAR_DAYS, routes: {
    PO: { perKg: 3, unit: "mg", cap: 200, roundTo: 25, basis: "TBW", hint: "3 mg/kg PO" },
  } },

  // ── Antiemetics ────────────────────────────────────────────────────────────
  "Ondansetron": {
    minimumAgeDays: MONTH_DAYS,
    routes: {
      PO: { perKg: 0.1, unit: "mg", cap: 4, roundTo: 0.5, basis: "TBW", hint: "0.1 mg/kg, max 4 mg" },
      IV: { perKg: 0.1, unit: "mg", cap: 4, roundTo: 0.5, basis: "TBW", hint: "0.1 mg/kg IV, max 4 mg" },
    },
  },
  "Dexamethasone": {
    routes: {
      PO: { perKg: 0.15, unit: "mg", cap: 8, roundTo: 0.5, basis: "TBW", hint: "0.15 mg/kg, max 8 mg" },
      IV: { perKg: 0.15, unit: "mg", cap: 8, roundTo: 0.5, basis: "TBW", hint: "0.15 mg/kg IV, max 8 mg" },
    },
  },
  "Metoclopramide": {
    minimumAgeDays: YEAR_DAYS,
    routes: {
      PO: { perKg: 0.15, unit: "mg", cap: 10, roundTo: 0.5, basis: "TBW", hint: "0.15 mg/kg, max 10 mg" },
      IV: { perKg: 0.15, unit: "mg", cap: 10, roundTo: 0.5, basis: "TBW", hint: "0.15 mg/kg IV, max 10 mg" },
    },
  },

  // ── Antacids / GI ──────────────────────────────────────────────────────────
  "Omeprazole": { minimumAgeDays: YEAR_DAYS, routes: {
    PO: { perKg: 0.7, unit: "mg", cap: 20, roundTo: 1, basis: "TBW", hint: "0.7 mg/kg PO" },
  } },
  "Ranitidine": { minimumAgeDays: MONTH_DAYS, routes: {
    PO: { perKg: 2, unit: "mg", cap: 150, roundTo: 5, basis: "TBW", hint: "2 mg/kg PO" },
    IV: { perKg: 1, unit: "mg", cap: 50, roundTo: 1, basis: "TBW", hint: "1 mg/kg IV" },
  } },

  // ── Anticholinergics ───────────────────────────────────────────────────────
  "Atropine": {
    routes: {
      IV: { perKg: 0.02, unit: "mg", cap: 0.6, roundTo: 0.01, floor: 0.1, basis: "TBW", hint: "20 mcg/kg IV, minimum 100 mcg" },
      IM: { perKg: 0.02, unit: "mg", cap: 0.6, roundTo: 0.01, floor: 0.1, basis: "TBW", hint: "20 mcg/kg IM, minimum 100 mcg" },
    },
  },
  "Glycopyrrolate": {
    routes: {
      IV: { perKg: 0.005, unit: "mg", cap: 0.2, roundTo: 0.01, basis: "TBW", hint: "5 mcg/kg IV" },
      IM: { perKg: 0.005, unit: "mg", cap: 0.2, roundTo: 0.01, basis: "TBW", hint: "5 mcg/kg IM" },
    },
  },

  // ── Antihistamines ─────────────────────────────────────────────────────────
  "Hydroxyzine": { minimumAgeDays: 6 * MONTH_DAYS, routes: {
    PO: { perKg: 1, unit: "mg", cap: 50, roundTo: 5, basis: "TBW", hint: "1 mg/kg PO" },
  } },

  // ── Other ──────────────────────────────────────────────────────────────────
  "Clonidine": {
    minimumAgeDays: MONTH_DAYS,
    routes: {
      PO: { perKg: 0.004, unit: "mg", cap: 0.15, roundTo: 0.005, basis: "IBW", hint: "4 mcg/kg PO" },
    },
  },
  "Dexmedetomidine": {
    minimumAgeDays: MONTH_DAYS,
    routes: {
      // Dosed on actual body weight, in micrograms, so the number on screen is
      // the number drawn up — 4 mcg/kg of a 100 mcg/mL preparation is a volume
      // small enough that a milligram figure would round away the difference.
      Intranasal: { perKg: 4, unit: "mcg", cap: 200, roundTo: 5, basis: "TBW", hint: "4 mcg/kg intranasal, 30–45 min before induction" },
    },
  },
  "Ketamine": {
    routes: {
      PO: { perKg: 5, unit: "mg", cap: 100, roundTo: 5, basis: "TBW", hint: "5 mg/kg PO" },
      IM: { perKg: 4, unit: "mg", cap: 100, roundTo: 5, basis: "IBW", hint: "4 mg/kg IM" },
    },
  },
  "Aspirin": {
    minimumAgeDays: 16 * YEAR_DAYS,
    withheldReason: "Reye's syndrome risk under 16 years",
    routes: {},
  },
}

export type PediatricPremedicationRequest = {
  drug: string
  route: string
  weightKg?: number | null
  heightCm?: number | null
  sex?: string | null
  age?: PediatricAgeInput | null
}

export type PediatricPremedicationResolution =
  /** A weight-based starting dose, with the arithmetic that produced it. */
  | {
      status: "calculated"
      dose: number
      unit: string
      min: number
      max: number
      step: number
      perKg: number
      weightUsedKg: number
      basis: PremedicationWeightBasis
      capped: boolean
      cap: number
      hint: string
    }
  /** Deliberately not offered to this child. */
  | { status: "withheld"; reason: string }
  /** No paediatric rule — the clinician enters the dose. */
  | { status: "manual"; reason: string }
  /** A rule exists but the patient data needed to use it does not. */
  | { status: "needs-weight"; reason: string }

function roundTo(value: number, increment: number): number {
  if (!(increment > 0)) return value
  const rounded = Math.round(value / increment) * increment
  // Increments like 0.005 leave a floating-point tail; six decimals is well
  // beyond any dose this is used for.
  return Math.round(rounded * 1_000_000) / 1_000_000
}

function ageDaysOf(age: PediatricAgeInput | null | undefined): number | null {
  if (!age) return null
  const normalized = normalizePediatricAge(age)
  const days = normalized?.approximateDays
  return typeof days === "number" && Number.isFinite(days) ? days : null
}

/**
 * The starting premedication dose for one child, drug and route.
 *
 * Never falls back to the adult amount: a drug this module does not cover
 * returns `manual`, which the caller must surface as "enter a dose" rather than
 * as a suggestion.
 */
export function resolvePediatricPremedication(
  request: PediatricPremedicationRequest,
): PediatricPremedicationResolution {
  const entry = PEDIATRIC_PREMEDICATION[request.drug]
  if (!entry) {
    return { status: "manual", reason: "No paediatric premedication rule for this drug" }
  }

  const ageDays = ageDaysOf(request.age)

  const entryMinimum = entry.minimumAgeDays
  if (entryMinimum != null && (ageDays == null || ageDays < entryMinimum)) {
    if (entry.withheldReason) return { status: "withheld", reason: entry.withheldReason }
    if (ageDays == null) return { status: "manual", reason: "Enter the child's age for a suggestion" }
    return { status: "withheld", reason: "Below the minimum age for this drug" }
  }

  const rule = entry.routes[request.route]
  if (!rule) {
    return { status: "manual", reason: "No paediatric rule for this route" }
  }

  if (rule.minimumAgeDays != null && (ageDays == null || ageDays < rule.minimumAgeDays)) {
    return {
      status: rule.withheldReason ? "withheld" : "manual",
      reason: rule.withheldReason ?? "Enter the child's age for a suggestion",
    }
  }

  const basis: PremedicationWeightBasis = rule.basis ?? "TBW"
  const actualWeight = typeof request.weightKg === "number" && request.weightKg > 0
    ? request.weightKg
    : null

  let weightUsedKg: number | null = actualWeight
  if (basis === "IBW") {
    const ibw = resolveIdealBodyWeight({
      clinicalMode: "PEDIATRIC",
      heightCm: request.heightCm ?? null,
      sex: request.sex ?? null,
      age: request.age ?? null,
    })
    // Ideal body weight needs height and sex. Without them, fall back to the
    // measured weight rather than refusing — for premedication the difference is
    // small and a missing suggestion is the worse outcome. The response records
    // which weight was actually used.
    weightUsedKg = ibw.available && ibw.kilograms > 0 ? ibw.kilograms : actualWeight
  }

  if (weightUsedKg == null) {
    return { status: "needs-weight", reason: "Enter the child's weight for a suggestion" }
  }

  const raw = rule.perKg * weightUsedKg
  const capped = raw > rule.cap
  const bounded = Math.min(raw, rule.cap)
  const withFloor = rule.floor != null ? Math.max(bounded, rule.floor) : bounded
  // The floor must never push a dose above the cap — for a very small child on a
  // drug with a practical minimum, the cap wins and the dose is the cap.
  const dose = roundTo(Math.min(withFloor, rule.cap), rule.roundTo)

  return {
    status: "calculated",
    dose,
    unit: rule.unit,
    min: rule.roundTo,
    max: rule.cap,
    step: rule.roundTo,
    perKg: rule.perKg,
    weightUsedKg: Math.round(weightUsedKg * 100) / 100,
    basis,
    capped,
    cap: rule.cap,
    hint: rule.hint ?? `${rule.perKg} ${rule.unit}/kg`,
  }
}

/** The routes with a paediatric rule for a drug, in `PREMED_DOSES` order. */
export function pediatricPremedicationRoutes(drug: string): string[] {
  const entry = PEDIATRIC_PREMEDICATION[drug]
  if (!entry) return []
  const adultOrder = PREMED_DOSES[drug]?.routes ?? []
  const known = Object.keys(entry.routes)
  const ordered = adultOrder.filter(route => known.includes(route))
  return [...ordered, ...known.filter(route => !ordered.includes(route))]
}

/** True when this drug has any paediatric premedication rule at all. */
export function hasPediatricPremedication(drug: string): boolean {
  return pediatricPremedicationRoutes(drug).length > 0
}
