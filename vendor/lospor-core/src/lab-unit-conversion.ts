import { LAB_LIBRARY } from "./labs"

/**
 * Deterministic conversion of a laboratory result into its canonical unit.
 *
 * This replaces a heuristic that inferred the source unit from the magnitude of
 * the number. That approach cannot work, because canonical and conventional
 * ranges overlap: a creatinine of 10 is a plausible neonatal value in µmol/L and
 * a plausible adult value in mg/dL. The heuristic assumed mg/dL and multiplied
 * by 88.4, turning a healthy newborn's result into 884 µmol/L — renal failure,
 * displayed as fact.
 *
 * So conversion here is driven by the unit that was actually printed on the
 * report. An unrecognised unit is reported as unconvertible; it is never
 * guessed.
 */

export type LabConversion =
  | { status: "converted"; value: number; unit: string; sourceValue: number; sourceUnit: string; factorApplied: string }
  | { status: "already-canonical"; value: number; unit: string; sourceValue: number; sourceUnit: string }
  | { status: "unknown-unit"; sourceValue: number; sourceUnit: string; canonicalUnit: string }
  | { status: "unknown-test"; sourceValue: number; sourceUnit: string }
  | { status: "unparsable"; raw: string }

const CANONICAL_UNIT = new Map(LAB_LIBRARY.map(test => [test.name, test.unit]))

/** Unit spellings normalise to these keys before lookup. */
function normaliseUnit(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .replace(/μ|µ/g, "u")        // micro sign vs Greek mu
    .replace(/\s+/g, "")
    .replace(/·/g, "")
    .replace(/percent|pct/, "%")
}

type Rule = { from: string; factor: number; describe: string }

/**
 * Accepted source units per test, and how to reach the canonical unit.
 *
 * Only conversions that are unambiguous and clinically standard are listed. If a
 * report uses anything else, the result is surfaced for manual entry rather than
 * converted on a guess.
 */
const RULES: Record<string, Rule[]> = {
  "Haemoglobin (Hb)": [
    { from: "g/dl", factor: 10, describe: "g/dL x 10" },
    { from: "mmol/l", factor: 16.114, describe: "mmol/L x 16.114" },
  ],
  "Haematocrit (Hct)": [
    { from: "l/l", factor: 100, describe: "L/L x 100" },
    { from: "ratio", factor: 100, describe: "ratio x 100" },
  ],
  MCHC: [{ from: "g/dl", factor: 10, describe: "g/dL x 10" }],
  Creatinine: [{ from: "mg/dl", factor: 88.4, describe: "mg/dL x 88.4" }],
  Glucose: [{ from: "mg/dl", factor: 1 / 18, describe: "mg/dL / 18" }],
  "Urea (BUN)": [{ from: "mg/dl", factor: 1 / 2.8, describe: "BUN mg/dL / 2.8" }],
  "Total bilirubin": [{ from: "mg/dl", factor: 17.1, describe: "mg/dL x 17.1" }],
  "Direct bilirubin": [{ from: "mg/dl", factor: 17.1, describe: "mg/dL x 17.1" }],
  CRP: [{ from: "mg/dl", factor: 10, describe: "mg/dL x 10" }],
  "Calcium (Ca²⁺)": [{ from: "mg/dl", factor: 0.25, describe: "mg/dL x 0.25" }],
}

/**
 * Analytes where a value below 1 can only be a fraction, never a percentage.
 *
 * This is a magnitude test, which the rest of this module deliberately refuses
 * to do — so it is confined to the single analyte where the two scales cannot
 * overlap. Haematocrit runs 0.10-0.75 as a fraction and 10-75 as a percentage;
 * no living patient has a haematocrit of 0.4%.
 *
 * It is NOT true of the library's other percentage tests, which is exactly why
 * this is a named set rather than a rule about "%": reticulocytes are normal at
 * 0.5-2.5%, eosinophils at 1-6%, monocytes at 2-10%. A value below 1 is a real
 * result for those, and multiplying it by 100 would invent a pathological one.
 *
 * The trigger is a report that printed the fraction with no unit at all, or one
 * the extractor labelled "%" while the number underneath is plainly a fraction.
 * Reports that print "L/L" or "ratio" are handled by the ordinary rules above.
 */
const FRACTION_WHEN_BELOW_ONE = new Set(["Haematocrit (Hct)"])
const FRACTION_SOURCE_UNITS = new Set(["", "%"])

function round(value: number): number {
  // Two significant decimals is enough for every canonical lab unit here and
  // avoids floating-point tails like 2.4999999999999996.
  return Math.round(value * 100) / 100
}

export function convertLabValue(test: string, rawValue: string, rawUnit: string): LabConversion {
  const value = Number.parseFloat(String(rawValue).replace(",", "."))
  if (!Number.isFinite(value)) return { status: "unparsable", raw: String(rawValue) }

  const canonicalUnit = CANONICAL_UNIT.get(test)
  if (canonicalUnit === undefined) {
    return { status: "unknown-test", sourceValue: value, sourceUnit: rawUnit }
  }

  const source = normaliseUnit(rawUnit)
  const canonical = normaliseUnit(canonicalUnit)

  // Checked before the canonical shortcut below, because the case this exists
  // for is a fraction the extractor has already labelled "%" — which would
  // otherwise sail through as "already canonical" and be offered pre-ticked.
  if (
    FRACTION_WHEN_BELOW_ONE.has(test)
    && FRACTION_SOURCE_UNITS.has(source)
    && value > 0
    && value < 1
  ) {
    return {
      status: "converted",
      value: round(value * 100),
      unit: canonicalUnit,
      sourceValue: value,
      sourceUnit: rawUnit,
      factorApplied: "fraction x 100",
    }
  }

  // A test with no canonical unit (ratios, titres) is stored as reported.
  if (canonicalUnit === "" || source === canonical) {
    return { status: "already-canonical", value: round(value), unit: canonicalUnit, sourceValue: value, sourceUnit: rawUnit }
  }

  const rule = (RULES[test] ?? []).find(r => normaliseUnit(r.from) === source)
  if (!rule) {
    return { status: "unknown-unit", sourceValue: value, sourceUnit: rawUnit, canonicalUnit }
  }

  return {
    status: "converted",
    value: round(value * rule.factor),
    unit: canonicalUnit,
    sourceValue: value,
    sourceUnit: rawUnit,
    factorApplied: rule.describe,
  }
}

/** True when the row is safe to offer pre-selected in a review screen. */
export function isConfidentConversion(conversion: LabConversion): boolean {
  return conversion.status === "converted" || conversion.status === "already-canonical"
}
