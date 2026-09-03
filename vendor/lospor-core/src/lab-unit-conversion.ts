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

/**
 * Unit spellings normalise to these keys before lookup.
 *
 * A FHIR `Observation` carries its unit as a UCUM code, and UCUM writes things
 * differently from a printed report: `mm[Hg]` not `mmHg`, `10*9/L` not `×10⁹/L`,
 * `ug/L` not `µg/L`, `Cel` not `°C`. An analyser's own export adds more —
 * `10^9/L`, `K/uL`, `mm/hr`, `sec`.
 *
 * None of that changes the number, so none of it should reach the conversion
 * table as a separate rule. It is flattened here instead, which is what lets a
 * result whose unit is merely spelled unfamiliarly be recognised as already
 * canonical rather than refused. Refusing is safe, but it makes a clinician tick
 * through rows the software could have accepted, which is the friction the
 * import exists to remove.
 *
 * @see https://ucum.org — the code system FHIR mandates for `Quantity.code`.
 */
const SUPERSCRIPTS: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-",
}

function normaliseUnit(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    // A superscript after 10 is an exponent, so it has to become 10*9 and not
    // 109 — flattening it first would turn a platelet count into gibberish that
    // still looks like a unit.
    .replace(/10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, (_, exponent: string) =>
      `10*${[...exponent].map(character => SUPERSCRIPTS[character] ?? character).join("")}`)
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g, character => SUPERSCRIPTS[character] ?? character)
    .replace(/μ|µ/g, "u")        // micro sign vs Greek mu
    .replace(/\s+/g, "")
    .replace(/·|×|\*(?![0-9-])/g, "")
    .replace(/\^/g, "*")          // 10^9/L, as analysers commonly export it
    .replace(/\[|\]/g, "")        // UCUM brackets an annotation: mm[Hg], [iU]
    .replace(/percent|pct/, "%")
    .replace(/^(sec|secs|seconds)$/, "s")
    .replace(/^mm\/hr$/, "mm/h")
    .replace(/^k\/ul$/, "10*3/ul") // K/µL, the usual haematology analyser export
    .replace(/^m\/ul$/, "10*6/ul")
}

type Rule = { from: string; factor: number; describe: string }

/**
 * Accepted source units per test, and how to reach the canonical unit.
 *
 * Only conversions that are unambiguous and clinically standard are listed. If a
 * report uses anything else, the result is surfaced for manual entry rather than
 * converted on a guess.
 *
 * Factors are from the AMA Manual of Style's SI conversion table, inverted
 * where our canonical unit is the conventional one and rescaled where it is a
 * different decimal prefix from theirs — troponin is the sharp case, since they
 * give ng/mL to µg/L and we store ng/L, a further thousand.
 *
 * @see https://academic.oup.com/amamanualofstyle/si-conversion-calculator
 *
 * Rules with a factor of 1 are here for a different reason: the value is
 * already right and only the unit expression differs in a way normaliseUnit
 * cannot flatten, because the two are genuinely different expressions that
 * happen to coincide for this analyte. 10³/µL is 10⁹/L exactly, and mEq/L is
 * mmol/L only for a monovalent ion — which is why sodium has that rule and
 * magnesium does not.
 */
const RULES: Record<string, Rule[]> = {
  // Haematology. The counts are pure re-expression: 10³/µL = 10⁹/L exactly.
  "Haemoglobin (Hb)": [
    { from: "g/dl", factor: 10, describe: "g/dL x 10" },
    { from: "mmol/l", factor: 16.114, describe: "mmol/L x 16.114" },
  ],
  "Haematocrit (Hct)": [
    { from: "l/l", factor: 100, describe: "L/L x 100" },
    { from: "ratio", factor: 100, describe: "ratio x 100" },
  ],
  "Erythrocytes (RBC)": [{ from: "10*6/ul", factor: 1, describe: "10⁶/µL = 10¹²/L" }],
  "Leucocytes (WBC)": [{ from: "10*3/ul", factor: 1, describe: "10³/µL = 10⁹/L" }],
  Platelets: [{ from: "10*3/ul", factor: 1, describe: "10³/µL = 10⁹/L" }],
  MCHC: [{ from: "g/dl", factor: 10, describe: "g/dL x 10" }],
  MCV: [{ from: "um3", factor: 1, describe: "µm³ = fL" }],

  // Coagulation.
  Fibrinogen: [{ from: "mg/dl", factor: 0.01, describe: "mg/dL x 0.01" }],
  "Anti-Xa": [{ from: "kiu/l", factor: 1, describe: "kIU/L = IU/mL" }],

  // Electrolytes. mEq/L equals mmol/L only where the ion is monovalent; for
  // calcium and magnesium it is half, which is exactly the sort of quiet
  // factor-of-two a magnitude heuristic would never catch.
  "Sodium (Na⁺)": [{ from: "meq/l", factor: 1, describe: "mEq/L = mmol/L (monovalent)" }],
  "Potassium (K⁺)": [{ from: "meq/l", factor: 1, describe: "mEq/L = mmol/L (monovalent)" }],
  "Chloride (Cl⁻)": [{ from: "meq/l", factor: 1, describe: "mEq/L = mmol/L (monovalent)" }],
  "Bicarbonate (HCO₃⁻)": [{ from: "meq/l", factor: 1, describe: "mEq/L = mmol/L (monovalent)" }],
  "HCO₃⁻ (ABG)": [{ from: "meq/l", factor: 1, describe: "mEq/L = mmol/L (monovalent)" }],
  "Base excess (BE)": [{ from: "meq/l", factor: 1, describe: "mEq/L = mmol/L (monovalent)" }],
  "Calcium (Ca²⁺)": [
    { from: "mg/dl", factor: 0.25, describe: "mg/dL x 0.25" },
    { from: "meq/l", factor: 0.5, describe: "mEq/L x 0.5 (divalent)" },
  ],
  "Ionised Ca²⁺": [
    { from: "mg/dl", factor: 0.25, describe: "mg/dL x 0.25" },
    { from: "meq/l", factor: 0.5, describe: "mEq/L x 0.5 (divalent)" },
  ],
  "Magnesium (Mg²⁺)": [
    { from: "mg/dl", factor: 0.4114, describe: "mg/dL x 0.4114" },
    { from: "meq/l", factor: 0.5, describe: "mEq/L x 0.5 (divalent)" },
  ],
  Phosphate: [{ from: "mg/dl", factor: 0.323, describe: "mg/dL x 0.323" }],

  // Chemistry.
  Creatinine: [{ from: "mg/dl", factor: 88.4, describe: "mg/dL x 88.4" }],
  // Left at 1/18, the bedside convention this shipped with. AMA gives 0.0555,
  // which agrees to three significant figures; the remaining 0.09% is far inside
  // analytical imprecision, and moving a pinned clinical value for it would be
  // change without improvement.
  Glucose: [{ from: "mg/dl", factor: 1 / 18, describe: "mg/dL / 18" }],
  "Urea (BUN)": [{ from: "mg/dl", factor: 0.357, describe: "BUN mg/dL x 0.357" }],
  "Uric acid": [{ from: "mg/dl", factor: 59.5, describe: "mg/dL x 59.5" }],
  "Total protein": [{ from: "g/dl", factor: 10, describe: "g/dL x 10" }],
  Albumin: [{ from: "g/dl", factor: 10, describe: "g/dL x 10" }],
  "Total bilirubin": [{ from: "mg/dl", factor: 17.104, describe: "mg/dL x 17.104" }],
  "Direct bilirubin": [{ from: "mg/dl", factor: 17.104, describe: "mg/dL x 17.104" }],
  CRP: [{ from: "mg/dl", factor: 10, describe: "mg/dL x 10" }],
  Lactate: [{ from: "mg/dl", factor: 0.111, describe: "mg/dL x 0.111" }],
  "Lactate (ABG)": [{ from: "mg/dl", factor: 0.111, describe: "mg/dL x 0.111" }],

  // Cardiac markers. Troponin is the one that must not be missed: our unit is
  // ng/L and ng/mL is a thousandfold, across the range where the number decides
  // whether someone is having a myocardial infarction.
  "Troponin I (hs-cTnI)": [
    { from: "ng/ml", factor: 1000, describe: "ng/mL x 1000" },
    { from: "ug/l", factor: 1000, describe: "µg/L x 1000" },
    { from: "pg/ml", factor: 1, describe: "pg/mL = ng/L" },
  ],
  "Troponin T (hs-cTnT)": [
    { from: "ng/ml", factor: 1000, describe: "ng/mL x 1000" },
    { from: "ug/l", factor: 1000, describe: "µg/L x 1000" },
    { from: "pg/ml", factor: 1, describe: "pg/mL = ng/L" },
  ],
  BNP: [{ from: "ng/l", factor: 1, describe: "ng/L = pg/mL" }],
  "NT-proBNP": [{ from: "ng/l", factor: 1, describe: "ng/L = pg/mL" }],
  Myoglobin: [{ from: "ng/ml", factor: 1, describe: "ng/mL = µg/L" }],

  // Blood gases. Much of Europe reports kPa; our canonical is mmHg, and a PaCO₂
  // of 5.3 kPa is a normal 40 mmHg. Taken unconverted it reads as profound
  // hypocapnia, which is the single most dangerous unit error in this list.
  "PaO₂": [{ from: "kpa", factor: 7.50062, describe: "kPa x 7.50062" }],
  "PaCO₂": [{ from: "kpa", factor: 7.50062, describe: "kPa x 7.50062" }],

  // Endocrine and inflammatory.
  TSH: [{ from: "uiu/ml", factor: 1, describe: "µIU/mL = mIU/L" }],
  "Free T4 (fT4)": [{ from: "ng/dl", factor: 12.871, describe: "ng/dL x 12.871" }],
  "Free T3 (fT3)": [{ from: "pg/ml", factor: 1.536, describe: "pg/mL x 1.536" }],
  Ferritin: [{ from: "ng/ml", factor: 1, describe: "ng/mL = µg/L" }],
  "Procalcitonin (PCT)": [{ from: "ng/ml", factor: 1, describe: "ng/mL = µg/L" }],
  "IL-6": [{ from: "ng/l", factor: 1, describe: "ng/L = pg/mL" }],
}

/**
 * Deliberately absent, so that a later reader does not add them as oversights.
 *
 * **HbA1c.** NGSP % and IFCC mmol/mol are related by
 * `IFCC = (NGSP − 2.15) × 10.929`, which is affine and not a factor. A `Rule`
 * cannot express it, and forcing one would be wrong across the whole range
 * rather than at the edges. It needs its own shape before it can be safe.
 *
 * **D-dimer.** Reported as fibrinogen-equivalent units or as D-dimer units, a
 * factor of about two apart, and the distinction frequently is not in the unit
 * string at all. Converting on what is printed would silently halve or double a
 * result that rules a pulmonary embolism in or out. It stays unconverted and is
 * shown to the clinician as the laboratory reported it.
 *
 * **Enzymes in IU/L.** U/L and IU/L are used interchangeably for catalytic
 * activity, so nothing needs converting; if a report ever meant something else
 * by IU, a silent alias would hide it.
 */

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
