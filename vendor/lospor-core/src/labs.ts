export type LabTest = {
  name: string
  unit: string
  refLow?: number
  refHigh?: number
  refText?: string
  /**
   * Where a result stops being merely abnormal and becomes alarming.
   *
   * Nothing bundled sets these, and that is the point. A critical value is a
   * published, analyte-specific threshold, not something derivable from a
   * reference range: potassium turns critical a little below its range and
   * sodium a long way below its own, and no single arithmetic rule gives
   * both. Only an explicit bound may call a result critical.
   */
  criticalLow?: number
  criticalHigh?: number
}

/**
 * The range a result should be judged against.
 *
 * A reporting laboratory's own range wins over the bundled one whenever it
 * sends one. The bundled ranges are one adult range per test, with no age,
 * sex, specimen or assay scope -- a neonatal haemoglobin reads as high
 * against them and a child's alkaline phosphatase reads as very high, while
 * both are ordinary. The laboratory that ran the assay is the only party
 * that knows which range applies.
 */
export type LabReferenceRange = {
  refLow?: number
  refHigh?: number
  criticalLow?: number
  criticalHigh?: number
}

/**
 * How a clinical item entered the record.
 *
 * Per item rather than per case, because a single preoperative assessment
 * routinely mixes all three: values typed at the bedside, values read off a
 * photographed report by AI, and values a hospital system proposed. "Patient
 * states penicillin allergy" and "the ward record says penicillin allergy" are
 * different strengths of evidence, and a record that cannot tell them apart
 * cannot show a clinician which one they are looking at.
 */
export type ClinicalItemSource = "manual" | "ai-scan" | "import"

/**
 * One laboratory result as the clinical forms hold it.
 *
 * Lives here because web and mobile both need it and had defined it
 * separately, character for character. The last time a clinical shape was
 * maintained in two places the two drifted, so this is the one copy.
 *
 * `takenAt` is when the specimen was drawn, which is not when somebody typed
 * it in: without it two haemoglobins three days apart are indistinguishable,
 * and neither a trend nor a safe deduplication is possible.
 */
export type LabResult = {
  test: string
  value: string
  unit: string
  source?: ClinicalItemSource
  takenAt?: string
  /**
   * The range the reporting laboratory gave for this result.
   *
   * Carried per result rather than per test because that is the grain at
   * which it is true: the same analyte has a different range for a neonate,
   * a pregnant patient and an adult, and the laboratory that ran the assay is
   * the only party that knows which applied. Absent falls back to the bundled
   * range.
   */
  refLow?: number
  refHigh?: number
  criticalLow?: number
  criticalHigh?: number
}

/**
 * A result read off a photographed report, carrying what the paper printed
 * alongside what will be stored.
 *
 * The endpoint sends these to every client. `confident` says whether the unit
 * was one the converter recognised, and decides whether a row is offered
 * already ticked; `sourceValue` and `sourceUnit` are what the report itself
 * said, so the conversion can be checked rather than trusted.
 */
export type ScannedLabResult = LabResult & {
  sourceValue?: string
  sourceUnit?: string
  confident?: boolean
}

/**
 * True when the stored value or unit is not what the report printed.
 *
 * The number on screen is an AI reading of a photograph multiplied by a
 * conversion factor. If either step is wrong the result still looks entirely
 * plausible on its own, so a reviewer needs the original beside it -- which is
 * the whole point of a review screen. Only one client showed it; the other
 * received the same fields and rendered a converted number with nothing to
 * check it against.
 */
export function labSourceDiffers(row: ScannedLabResult): boolean {
  if (row.sourceValue === undefined) return false
  return row.sourceValue !== String(row.value) || (row.sourceUnit ?? "") !== row.unit
}

export type LabCategory = {
  id: string
  label: string
  tests: LabTest[]
}

export const LAB_CATEGORIES: LabCategory[] = [
  {
    id: "haematology",
    label: "Haematology",
    tests: [
      { name: "Haemoglobin (Hb)", unit: "g/L", refLow: 120, refHigh: 175 },
      { name: "Haematocrit (Hct)", unit: "%", refLow: 36, refHigh: 52 },
      { name: "Erythrocytes (RBC)", unit: "×10¹²/L", refLow: 3.8, refHigh: 5.8 },
      { name: "Leucocytes (WBC)", unit: "×10⁹/L", refLow: 4, refHigh: 11 },
      { name: "Platelets", unit: "×10⁹/L", refLow: 150, refHigh: 400 },
      { name: "MCV", unit: "fL", refLow: 80, refHigh: 100 },
      { name: "MCH", unit: "pg", refLow: 27, refHigh: 33 },
      { name: "MCHC", unit: "g/L", refLow: 320, refHigh: 360 },
      { name: "Neutrophils", unit: "%", refLow: 40, refHigh: 75 },
      { name: "Lymphocytes", unit: "%", refLow: 20, refHigh: 45 },
      { name: "Monocytes", unit: "%", refLow: 2, refHigh: 10 },
      { name: "Eosinophils", unit: "%", refLow: 1, refHigh: 6 },
      { name: "Reticulocytes", unit: "%", refLow: 0.5, refHigh: 2.5 },
    ],
  },
  {
    id: "coagulation",
    label: "Coagulation",
    tests: [
      { name: "PT (Prothrombin time)", unit: "s", refLow: 11, refHigh: 15 },
      { name: "INR", unit: "", refLow: 0.8, refHigh: 1.2 },
      { name: "aPTT", unit: "s", refLow: 25, refHigh: 38 },
      { name: "Fibrinogen", unit: "g/L", refLow: 2, refHigh: 4 },
      { name: "D-dimer", unit: "mg/L FEU", refHigh: 0.5 },
      { name: "Thrombin time (TT)", unit: "s", refLow: 14, refHigh: 19 },
      { name: "Anti-Xa", unit: "IU/mL" },
    ],
  },
  {
    id: "electrolytes",
    label: "Electrolytes",
    tests: [
      { name: "Sodium (Na⁺)", unit: "mmol/L", refLow: 136, refHigh: 145 },
      { name: "Potassium (K⁺)", unit: "mmol/L", refLow: 3.5, refHigh: 5.1 },
      { name: "Chloride (Cl⁻)", unit: "mmol/L", refLow: 98, refHigh: 107 },
      { name: "Bicarbonate (HCO₃⁻)", unit: "mmol/L", refLow: 22, refHigh: 29 },
      { name: "Calcium (Ca²⁺)", unit: "mmol/L", refLow: 2.15, refHigh: 2.55 },
      { name: "Ionised Ca²⁺", unit: "mmol/L", refLow: 1.15, refHigh: 1.35 },
      { name: "Magnesium (Mg²⁺)", unit: "mmol/L", refLow: 0.7, refHigh: 1.0 },
      { name: "Phosphate", unit: "mmol/L", refLow: 0.8, refHigh: 1.5 },
    ],
  },
  {
    id: "biochemistry",
    label: "Biochemistry",
    tests: [
      { name: "Creatinine", unit: "μmol/L", refLow: 44, refHigh: 115 },
      { name: "eGFR", unit: "mL/min/1.73m²", refLow: 60 },
      { name: "Urea (BUN)", unit: "mmol/L", refLow: 2.5, refHigh: 7.8 },
      { name: "Glucose", unit: "mmol/L", refLow: 3.9, refHigh: 6.1 },
      { name: "HbA1c", unit: "%", refHigh: 6.5 },
      { name: "Lactate", unit: "mmol/L", refLow: 0.5, refHigh: 2.2 },
      { name: "Uric acid", unit: "μmol/L", refLow: 202, refHigh: 416 },
      { name: "Total protein", unit: "g/L", refLow: 64, refHigh: 83 },
      { name: "Albumin", unit: "g/L", refLow: 35, refHigh: 52 },
    ],
  },
  {
    id: "liver",
    label: "Liver",
    tests: [
      { name: "ALT (SGPT)", unit: "U/L", refHigh: 56 },
      { name: "AST (SGOT)", unit: "U/L", refHigh: 40 },
      { name: "ALP", unit: "U/L", refLow: 44, refHigh: 147 },
      { name: "GGT", unit: "U/L", refHigh: 55 },
      { name: "Total bilirubin", unit: "μmol/L", refHigh: 21 },
      { name: "Direct bilirubin", unit: "μmol/L", refHigh: 5 },
      { name: "Total bile acids", unit: "μmol/L", refHigh: 10 },
    ],
  },
  {
    id: "cardiac",
    label: "Cardiac",
    tests: [
      { name: "Troponin I (hs-cTnI)", unit: "ng/L", refHigh: 26 },
      { name: "Troponin T (hs-cTnT)", unit: "ng/L", refHigh: 14 },
      { name: "CK (Creatine kinase)", unit: "U/L", refHigh: 200 },
      { name: "CK-MB", unit: "U/L", refHigh: 25 },
      { name: "BNP", unit: "pg/mL", refHigh: 100 },
      { name: "NT-proBNP", unit: "pg/mL", refHigh: 125 },
      { name: "Myoglobin", unit: "μg/L", refHigh: 90 },
    ],
  },
  {
    id: "blood_gas",
    label: "Blood Gas",
    tests: [
      { name: "pH", unit: "", refLow: 7.35, refHigh: 7.45 },
      { name: "PaO₂", unit: "mmHg", refLow: 80, refHigh: 100 },
      { name: "PaCO₂", unit: "mmHg", refLow: 35, refHigh: 45 },
      { name: "HCO₃⁻ (ABG)", unit: "mmol/L", refLow: 22, refHigh: 26 },
      { name: "Base excess (BE)", unit: "mmol/L", refLow: -2, refHigh: 2 },
      { name: "SaO₂", unit: "%", refLow: 94, refHigh: 99 },
      { name: "Lactate (ABG)", unit: "mmol/L", refLow: 0.5, refHigh: 2.0 },
    ],
  },
  {
    id: "thyroid",
    label: "Thyroid",
    tests: [
      { name: "TSH", unit: "mIU/L", refLow: 0.4, refHigh: 4.0 },
      { name: "Free T4 (fT4)", unit: "pmol/L", refLow: 12, refHigh: 22 },
      { name: "Free T3 (fT3)", unit: "pmol/L", refLow: 3.5, refHigh: 6.5 },
    ],
  },
  {
    id: "inflammatory",
    label: "Inflammatory",
    tests: [
      { name: "CRP", unit: "mg/L", refHigh: 10 },
      { name: "ESR", unit: "mm/h", refHigh: 20 },
      { name: "Ferritin", unit: "μg/L", refLow: 12, refHigh: 300 },
      { name: "Procalcitonin (PCT)", unit: "μg/L", refHigh: 0.25 },
      { name: "IL-6", unit: "pg/mL", refHigh: 7 },
    ],
  },
]

export const LAB_LIBRARY = LAB_CATEGORIES.flatMap(category => category.tests)

export function getLabByName(name: string): LabTest | undefined {
  return LAB_LIBRARY.find(test => test.name === name)
}

/**
 * A laboratory value as a number, or null because it is not one.
 *
 * parseFloat reads until the string stops making sense and returns what it
 * got, so "5.2 (H)" becomes 5.2 and the flag is lost, and a European "5,8"
 * read without the comma becomes 5 -- a normal-looking potassium standing in
 * for a dangerous one. The invented number then carries an abnormal flag and
 * reaches the export as though it had been measured, with nothing recording
 * that it was ever text.
 *
 * So the whole string has to be a number. A comma decimal is accepted because
 * that is how results are printed here, and everything else keeps its text and
 * no numeric value -- which the record already supports, since "negative" and
 * "<0.01" are real results reported the way laboratories report them. A
 * partially numeric string is treated the same honest way rather than
 * silently truncated.
 */
export function parseLabValue(value: unknown): number | null {
  const text = String(value ?? "").trim().replace(",", ".")
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text)) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}
export function getLabOutOfRange(
  test: LabTest,
  value: number,
  supplied?: LabReferenceRange,
): "low" | "high" | null {
  const range = rangeFor(test, supplied)
  if (range.refLow !== undefined && value < range.refLow) return "low"
  if (range.refHigh !== undefined && value > range.refHigh) return "high"
  return null
}

/**
 * The bounds a result is judged against.
 *
 * The reference range is taken as a whole -- theirs if they sent one, ours
 * otherwise. Never merged bound by bound: half of their range and half of ours
 * is a range no laboratory published and nobody could defend.
 *
 * Critical thresholds are taken separately, because they are a separate claim.
 * A laboratory that sends only "phone below 2.5" has said something true and
 * specific, and gating it behind whether they also restated the reference range
 * would throw the one bound that matters most away.
 */
export function rangeFor(test: LabTest, supplied?: LabReferenceRange): LabReferenceRange {
  const hasSuppliedRange = supplied !== undefined
    && (supplied.refLow !== undefined || supplied.refHigh !== undefined)
  const range = hasSuppliedRange
    ? { refLow: supplied.refLow, refHigh: supplied.refHigh }
    : { refLow: test.refLow, refHigh: test.refHigh }
  return {
    ...range,
    criticalLow: supplied?.criticalLow ?? test.criticalLow,
    criticalHigh: supplied?.criticalHigh ?? test.criticalHigh,
  }
}

/**
 * How far out of range, and whether it is alarming.
 *
 * Out of range is arithmetic against whatever range applies, and the
 * reporting laboratory's own range is used whenever it sent one.
 *
 * Critical is not arithmetic. It was derived from the reference range --
 * half the lower bound, one and a half times the upper -- and that is wrong
 * in both directions at once. Multiplying a negative bound by a half moves it
 * *towards* zero, so base excess, whose range is -2 to 2, had a critical-low
 * threshold of -1 and reported every ordinary slightly-negative base excess
 * as critical. Scaling from the range's width instead fixes that and breaks
 * something else: it makes a sodium of 130 critical, when critical
 * hyponatraemia is nearer 120, while getting potassium about right.
 *
 * No single rule gives both, because a critical value is not a property of a
 * reference range. It is a published, analyte-specific threshold -- what a
 * laboratory phones a clinician about -- and it lives at a different distance
 * from the range for every analyte. So it is asserted only where an explicit
 * threshold exists, which today means only where a reporting laboratory sends
 * one. Nothing bundled sets one.
 *
 * The effect is that a value far outside its range now reads as high or low
 * rather than critical. That is a smaller claim, and it is one the data
 * supports.
 */
/** Whatever range came with this result, if the laboratory sent one. */
export function suppliedRange(result: LabResult): LabReferenceRange {
  return {
    refLow: result.refLow,
    refHigh: result.refHigh,
    criticalLow: result.criticalLow,
    criticalHigh: result.criticalHigh,
  }
}

export function getLabSeverity(
  test: LabTest,
  value: number,
  supplied?: LabReferenceRange,
): "critical" | "high" | "low" | "normal" | null {
  if (!Number.isFinite(value)) return null
  const range = rangeFor(test, supplied)
  // Nothing to judge against. Null rather than "normal": a result with no
  // reference range has not been found normal, it has not been assessed, and
  // reporting the two the same way is how a rangeless Anti-Xa ends up reading
  // as reassurance.
  if (range.refLow === undefined && range.refHigh === undefined) return null
  if (range.criticalHigh !== undefined && value > range.criticalHigh) return "critical"
  if (range.criticalLow !== undefined && value < range.criticalLow) return "critical"
  return getLabOutOfRange(test, value, supplied) ?? "normal"
}

export function getLabFlag(test: LabTest, value: number): "low" | "high" | "normal" | null {
  if (!Number.isFinite(value)) return null
  return getLabOutOfRange(test, value) ?? "normal"
}

export function formatLabReferenceRange(test: LabTest): string | null {
  if (test.refText) return test.refText
  if (test.refLow === undefined && test.refHigh === undefined) return null
  if (test.refLow !== undefined && test.refHigh !== undefined) return `${test.refLow}-${test.refHigh}`
  if (test.refLow !== undefined) return `>=${test.refLow}`
  return `<=${test.refHigh}`
}

/**
 * One specimen, and every result that came off it.
 *
 * Preoperatively a case has one set of labs and nothing needs grouping. During
 * a case it has several: a gas at induction, another after the blood, a
 * haemoglobin an hour later. Those are draws, not a flat list -- fifteen rows
 * that all say 09:42 are one blood sample, and presenting them as fifteen
 * independent facts is both unreadable and clinically wrong, because what a
 * clinician reads off a panel is the panel.
 */
export type LabDraw = {
  /** ISO instant the specimen was taken, or null for results with no time. */
  takenAt: string | null
  results: LabResult[]
}

/**
 * Group results into draws by `takenAt`, newest first.
 *
 * Results with no `takenAt` collapse into a single undated draw sorted last:
 * preoperative labs typed by hand routinely have no draw time, and dropping
 * them or scattering them through the timeline would both be worse than saying
 * plainly that the time is unknown.
 *
 * Grouping is on the exact stored instant rather than a tolerance window. Two
 * samples really drawn a minute apart are two samples, and a machine that
 * reports one panel reports one timestamp for it -- inventing a window would
 * merge draws that a clinician deliberately recorded as separate.
 */
export function groupLabsByDraw(results: LabResult[]): LabDraw[] {
  const byTime = new Map<string, LabResult[]>()
  const undated: LabResult[] = []
  for (const result of results) {
    if (!result.takenAt) {
      undated.push(result)
      continue
    }
    const existing = byTime.get(result.takenAt)
    if (existing) existing.push(result)
    else byTime.set(result.takenAt, [result])
  }

  const draws: LabDraw[] = [...byTime]
    .map(([takenAt, drawResults]) => ({ takenAt, results: drawResults }))
    // Descending: during a case the most recent gas is the one being acted on,
    // and it should not be at the bottom of a growing list.
    .sort((a, b) => (a.takenAt! < b.takenAt! ? 1 : a.takenAt! > b.takenAt! ? -1 : 0))

  if (undated.length > 0) draws.push({ takenAt: null, results: undated })
  return draws
}

export function searchLabs(query: string): { category: LabCategory; test: LabTest }[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const results: { category: LabCategory; test: LabTest }[] = []
  for (const category of LAB_CATEGORIES) {
    for (const test of category.tests) {
      if (test.name.toLowerCase().includes(q)) {
        results.push({ category, test })
      }
    }
  }
  return results
}

/**
 * A result judged against its own reference range.
 *
 * `critical` is not a range the catalogue carries — it is a flag the API
 * computes and stores alongside the value. Kept separate from high/low here
 * because the two mean different things to somebody glancing at a timetable at
 * 2am: high is worth reading, critical is worth stopping for.
 */
export type LabAbnormality = {
  result: LabResult
  test: LabTest
  severity: "critical" | "high" | "low" | "normal"
}

/**
 * How many abnormal results a collapsed summary row shows.
 *
 * Three, because the row exists to be read at a glance while something else is
 * happening. Fifteen abnormal results rendered inline is not information, it is
 * a wall — and the one that mattered is somewhere in the middle of it. The rest
 * are reached by opening the full list, which is one tap away.
 */
export const ABNORMAL_SUMMARY_LIMIT = 3

/**
 * What a collapsed timetable row shows for the most recent draw.
 *
 * Abnormal results first, worst first. When nothing is out of range it falls
 * back to the first few results anyway, rather than rendering an empty row: an
 * empty row is ambiguous -- it reads the same whether the panel was normal or
 * whether nobody has looked -- and "Na 140, K 4.2, Hb 130" says plainly that
 * somebody drew bloods and they were fine.
 *
 * Only the newest draw, deliberately. An earlier haemoglobin of 88 that is now
 * 104 describes a patient who has been transfused, not a patient who is
 * anaemic; showing both in a summary invites acting on the older number. The
 * trend is still there for anyone who opens the full list.
 *
 * A test with no reference range is left out. Anti-Xa is the only one in the
 * catalogue, and it is rangeless on purpose — its therapeutic window depends on
 * the indication and the drug. A row that cannot say whether it is abnormal
 * must not imply that it is normal either, so it appears in the full list and
 * not in the summary.
 */
export function abnormalSummary(
  results: LabResult[],
  limit: number = ABNORMAL_SUMMARY_LIMIT,
): { shown: LabAbnormality[]; hiddenCount: number } {
  const [newest] = groupLabsByDraw(results)
  if (!newest) return { shown: [], hiddenCount: 0 }

  const abnormal: LabAbnormality[] = []
  for (const result of newest.results) {
    const test = getLabByName(result.test)
    // No entry in the catalogue, or an entry with nothing to judge against.
    if (!test) continue
    const supplied = suppliedRange(result)
    if (test.refLow === undefined && test.refHigh === undefined
      && supplied.refLow === undefined && supplied.refHigh === undefined) continue

    const value = parseLabValue(result.value)
    if (value === null) continue

    const severity = getLabSeverity(test, value, supplied)
    if (!severity || severity === "normal") continue

    abnormal.push({ result, test, severity })
  }

  // Criticals first; within a severity, the order the results arrived in, which
  // is the order the laboratory reported them.
  abnormal.sort((a, b) =>
    (a.severity === "critical" ? 0 : 1) - (b.severity === "critical" ? 0 : 1))

  if (abnormal.length > 0) {
    return {
      shown: abnormal.slice(0, limit),
      hiddenCount: Math.max(0, abnormal.length - limit),
    }
  }

  // Nothing out of range. Show the first few as they were reported, so the row
  // still carries the fact that a draw happened and what it said.
  //
  // Only results actually judged normal. A rangeless test or an unparseable
  // value cannot be called normal any more than it could be called abnormal --
  // labelling it so here would be the same false reassurance the exclusion
  // above exists to prevent. Both still appear in the full list.
  const normal: LabAbnormality[] = []
  for (const result of newest.results) {
    const test = getLabByName(result.test)
    if (!test) continue
    const value = parseLabValue(result.value)
    // A result that is not a number has not been found normal either. "Sample
    // haemolysed" belongs in neither half of this summary.
    if (value === null) continue
    if (getLabSeverity(test, value, suppliedRange(result)) !== "normal") continue
    normal.push({ result, test, severity: "normal" })
  }
  return {
    shown: normal.slice(0, limit),
    hiddenCount: Math.max(0, normal.length - limit),
  }
}
