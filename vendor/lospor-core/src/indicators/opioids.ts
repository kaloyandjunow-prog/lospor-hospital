/**
 * Intraoperative opioid use as an estimate in parenteral
 * morphine equivalents (10.0.0): milligrams of IV morphine with the same
 * analgesic effect.
 *
 * The factors are the ones in common equianalgesic tables for parenteral
 * dosing, relative to morphine 10 mg IV/IM (for example fentanyl 0.1 mg,
 * sufentanil 0.01 mg, hydromorphone 1.5 mg, pethidine 100 mg). They are
 * approximations from single-dose studies, not exchange rates: the figure is
 * for comparing practice across a ward, never for dosing a patient.
 *
 * Only parenteral routes count. A neuraxial dose (intrathecal, epidural) acts
 * at a fraction of the parenteral dose and has no agreed factor here, so it is
 * reported apart, as a case that received one.
 */
export type OpioidFactor = { pattern: RegExp; key: string; perMg: number }

export const OPIOID_MORPHINE_FACTORS: readonly OpioidFactor[] = Object.freeze([
  { key: "morphine", pattern: /\bmorphine\b/i, perMg: 1 },
  { key: "fentanyl", pattern: /\bfentanyl\b/i, perMg: 100 },
  { key: "sufentanil", pattern: /\bsufentanil\b/i, perMg: 1000 },
  { key: "remifentanil", pattern: /\bremifentanil\b/i, perMg: 100 },
  { key: "alfentanil", pattern: /\balfentanil\b/i, perMg: 10 },
  { key: "hydromorphone", pattern: /\bhydromorphone\b/i, perMg: 6.7 },
  { key: "oxycodone", pattern: /\boxycodone\b/i, perMg: 1 },
  { key: "piritramide", pattern: /\bpiritramide\b/i, perMg: 0.7 },
  { key: "pethidine", pattern: /\b(pethidine|meperidine)\b/i, perMg: 0.1 },
  { key: "tramadol", pattern: /\btramadol\b/i, perMg: 0.1 },
  { key: "nalbuphine", pattern: /\bnalbuphine\b/i, perMg: 1 },
  { key: "buprenorphine", pattern: /\bbuprenorphine\b/i, perMg: 33 },
  { key: "butorphanol", pattern: /\bbutorphanol\b/i, perMg: 5 },
])

// Remifentanil matches "fentanyl" too: the more specific names are tried first.
const BY_SPECIFICITY = [...OPIOID_MORPHINE_FACTORS].sort((left, right) => right.key.length - left.key.length)

/** The opioid a drug name is, or null for anything else. */
export function opioidFactorFor(name: string): OpioidFactor | null {
  return BY_SPECIFICITY.find(factor => factor.pattern.test(name)) ?? null
}

const MG_PER_UNIT: Readonly<Record<string, number>> = { ng: 1e-6, mcg: 1e-3, "µg": 1e-3, ug: 1e-3, mg: 1, g: 1000 }

/** A dose in milligrams, or null when its unit is not a mass. */
export function doseInMg(amount: number, unit: string): number | null {
  const factor = MG_PER_UNIT[unit.trim().toLowerCase()]
  return factor != null && Number.isFinite(amount) ? amount * factor : null
}

const NEURAXIAL = /intrathecal|spinal|epidural|caudal|neuraxial|\bIT\b|\bEPI\b/i

/** Whether a route is neuraxial, where parenteral factors do not apply. */
export function isNeuraxialRoute(route: string | null | undefined): boolean {
  return !!route && NEURAXIAL.test(route)
}

export type OpioidDose = { name: string; amount: number; unit: string; route?: string | null }

/**
 * Morphine-equivalent milligrams of a case's opioids, the neuraxial ones set
 * apart, and any opioid whose amount could not be read as a mass.
 */
export function morphineEquivalents(doses: readonly OpioidDose[]): { mg: number; neuraxial: boolean; unconverted: string[]; given: boolean } {
  let mg = 0
  let neuraxial = false
  let given = false
  const unconverted = new Set<string>()
  for (const dose of doses) {
    const factor = opioidFactorFor(dose.name)
    if (!factor || !(dose.amount > 0)) continue
    given = true
    if (isNeuraxialRoute(dose.route)) {
      neuraxial = true
      continue
    }
    const amountMg = doseInMg(dose.amount, dose.unit)
    if (amountMg == null) {
      unconverted.add(factor.key)
      continue
    }
    mg += amountMg * factor.perMg
  }
  return { mg: Math.round(mg * 10) / 10, neuraxial, unconverted: [...unconverted], given }
}
