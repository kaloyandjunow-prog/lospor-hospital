import type { LabResult } from "../labs"
import type { IntraopEventOps } from "../intraop-timetable-edit"
import type { LogEvent } from "../intraop-types"
import type { SuggestionPatient } from "./context"

/**
 * Questions from intraoperative lab results (10.2.0, L1-L7). A result asks
 * whenever it crosses its limit, typed by hand or imported from the EHR
 * during the case. The hospital's own critical bounds (carried on the result)
 * come first; the fixed values below apply only where none is set.
 *
 * L6 (fibrinogen) suggests treatment without logging a complication.
 */

export type LabQuestionKind =
  | "hyperkalaemia" | "hypokalaemia" | "hypoglycaemia" | "hyperglycaemia" | "hypocalcaemia"
  | "hyponatraemia" | "hypernatraemia" | "haemorrhage" | "lowFibrinogen" | "troponin"

export type LabQuestion = {
  key: string
  kind: LabQuestionKind
  result: LabResult
  value: number
  /** The limit it crossed, for the question's words. */
  limit: number
  /** Hb: the fall since the previous draw, when that is what asked. */
  fall?: number
  /** The complication a yes logs; null for the fibrinogen suggestion. */
  complication: string | null
  /** When the result was taken; the complication takes this time. */
  ts: string
  /** False when the source did not provide a specimen time; `ts` is only the
   * time the question was prepared and must not be presented as draw time. */
  timeKnown: boolean
}

const NEWBORN_DAYS = 28

/** The library test each lab question looks for, by exact name. A test renamed in the library silently stops its question; the wiring test holds the two together. */
export const LAB_TEST_NAMES = {
  potassium: "Potassium (K⁺)",
  glucose: "Glucose",
  ionisedCalcium: "Ionised Ca²⁺",
  totalCalcium: "Calcium (Ca²⁺)",
  sodium: "Sodium (Na⁺)",
  haemoglobin: "Haemoglobin (Hb)",
  fibrinogen: "Fibrinogen",
  troponinI: "Troponin I (hs-cTnI)",
  troponinT: "Troponin T (hs-cTnT)",
} as const
const TEST = LAB_TEST_NAMES

/** The fallback limits, used only where the hospital set no critical bound. */
export const LAB_FALLBACK_LIMITS = Object.freeze({
  potassium: { low: 3.0, high: 6.0 },
  glucose: { low: 4.0, newbornLow: 2.6, high: 12.0 },
  ionisedCalcium: { low: 1.0 },
  totalCalcium: { low: 1.9 },
  sodium: { low: 130, high: 150 },
  haemoglobin: { low: 70, fall: 20 },
  fibrinogen: { low: 1.5 },
  troponinI: { high: 26 },
  troponinT: { high: 14 },
})

const number = (result: LabResult) => {
  const parsed = Number.parseFloat(String(result.value).replace(",", "."))
  return Number.isFinite(parsed) ? parsed : null
}

const knownTakenAt = (result: LabResult): string | null => {
  if (!result.takenAt || !Number.isFinite(Date.parse(result.takenAt))) return null
  return result.takenAt
}

/** The questions waiting now, from the case's intraoperative lab results. */
export function labQuestions(results: readonly LabResult[], log: LogEvent[], patient: SuggestionPatient, now: Date | string | number): LabQuestion[] {
  const fallbackTs = new Date(now).toISOString()
  // Results without a specimen time used to collapse to test/value/unit. Two
  // identical undated draws then shared one dismissal and one complication id.
  // Prefer a source row id; the index is a deterministic compatibility key for
  // old records that predate the id field.
  const sourceIndex = new Map<LabResult, number>(results.map((result, index) => [result, index]))
  const key = (result: LabResult) => `${result.test}@${knownTakenAt(result) ?? `unknown:${result.id ?? `${result.sourceVocabulary ?? ""}:${result.sourceCode ?? ""}:${sourceIndex.get(result) ?? 0}`}:${result.value}:${result.unit}`}`
  const usable = results.filter(result => !result.unsupported && !result.unconverted && number(result) != null)
  const byTest = (test: string) => usable.filter(result => result.test === test)
    // Unknown specimen times are not epoch zero and must not produce a NaN
    // comparator. Keep them after dated results, preserving source order.
    .sort((a, b) => (knownTakenAt(a) ? Date.parse(knownTakenAt(a)!) : Number.POSITIVE_INFINITY)
      - (knownTakenAt(b) ? Date.parse(knownTakenAt(b)!) : Number.POSITIVE_INFINITY))
  const latest = (test: string) => { const list = byTest(test); return list[list.length - 1] }
  const questions: LabQuestion[] = []

  const ask = (kind: LabQuestionKind, result: LabResult, limit: number, complication: string | null, fall?: number) => {
    const value = number(result)!
    const timeKnown = knownTakenAt(result) != null
    const ts = timeKnown ? result.takenAt! : fallbackTs
    questions.push({ key: `lab:${kind}:${key(result)}`, kind, result, value, limit, complication, ts, timeKnown, ...(fall != null ? { fall } : {}) })
  }
  const low = (result: LabResult, fallback: number) => result.criticalLow ?? fallback
  const high = (result: LabResult, fallback: number) => result.criticalHigh ?? fallback

  const potassium = latest(TEST.potassium)
  if (potassium) {
    const value = number(potassium)!
    if (value > high(potassium, LAB_FALLBACK_LIMITS.potassium.high)) ask("hyperkalaemia", potassium, high(potassium, LAB_FALLBACK_LIMITS.potassium.high), "Hyperkalaemia")
    else if (value < low(potassium, LAB_FALLBACK_LIMITS.potassium.low)) ask("hypokalaemia", potassium, low(potassium, LAB_FALLBACK_LIMITS.potassium.low), "Hypokalaemia")
  }

  const glucose = latest(TEST.glucose)
  if (glucose) {
    const value = number(glucose)!
    const lowFallback = patient.ageDays != null && patient.ageDays < NEWBORN_DAYS ? LAB_FALLBACK_LIMITS.glucose.newbornLow : LAB_FALLBACK_LIMITS.glucose.low
    if (value < low(glucose, lowFallback)) ask("hypoglycaemia", glucose, low(glucose, lowFallback), "Hypoglycaemia")
    else if (value > high(glucose, LAB_FALLBACK_LIMITS.glucose.high)) ask("hyperglycaemia", glucose, high(glucose, LAB_FALLBACK_LIMITS.glucose.high), "Hyperglycaemia")
  }

  // Ionised calcium is the measure; total calcium asks only for a draw without one.
  const ionised = latest(TEST.ionisedCalcium)
  const total = latest(TEST.totalCalcium)
  if (ionised && number(ionised)! < low(ionised, LAB_FALLBACK_LIMITS.ionisedCalcium.low)) {
    ask("hypocalcaemia", ionised, low(ionised, LAB_FALLBACK_LIMITS.ionisedCalcium.low), "Hypocalcaemia")
  } else if (total && !usable.some(result => result.test === TEST.ionisedCalcium && knownTakenAt(result) != null && knownTakenAt(result) === knownTakenAt(total))
    && number(total)! < low(total, LAB_FALLBACK_LIMITS.totalCalcium.low)) {
    ask("hypocalcaemia", total, low(total, LAB_FALLBACK_LIMITS.totalCalcium.low), "Hypocalcaemia")
  }

  const sodium = latest(TEST.sodium)
  if (sodium) {
    const value = number(sodium)!
    if (value < low(sodium, LAB_FALLBACK_LIMITS.sodium.low)) ask("hyponatraemia", sodium, low(sodium, LAB_FALLBACK_LIMITS.sodium.low), "Hyponatraemia")
    else if (value > high(sodium, LAB_FALLBACK_LIMITS.sodium.high)) ask("hypernatraemia", sodium, high(sodium, LAB_FALLBACK_LIMITS.sodium.high), "Hypernatraemia")
  }

  const haemoglobin = byTest(TEST.haemoglobin)
  const hb = haemoglobin[haemoglobin.length - 1]
  if (hb) {
    const value = number(hb)!
    const previous = haemoglobin[haemoglobin.length - 2]
    const fall = previous ? number(previous)! - value : null
    if (value < low(hb, LAB_FALLBACK_LIMITS.haemoglobin.low)) ask("haemorrhage", hb, low(hb, LAB_FALLBACK_LIMITS.haemoglobin.low), "Massive haemorrhage")
    else if (fall != null && fall >= LAB_FALLBACK_LIMITS.haemoglobin.fall) ask("haemorrhage", hb, LAB_FALLBACK_LIMITS.haemoglobin.fall, "Massive haemorrhage", fall)
  }

  const fibrinogen = latest(TEST.fibrinogen)
  if (fibrinogen && number(fibrinogen)! < low(fibrinogen, LAB_FALLBACK_LIMITS.fibrinogen.low)) {
    ask("lowFibrinogen", fibrinogen, low(fibrinogen, LAB_FALLBACK_LIMITS.fibrinogen.low), null)
  }

  for (const [test, fallback] of [[TEST.troponinI, LAB_FALLBACK_LIMITS.troponinI.high], [TEST.troponinT, LAB_FALLBACK_LIMITS.troponinT.high]] as const) {
    const troponin = latest(test)
    if (!troponin) continue
    const limit = troponin.criticalHigh ?? troponin.refHigh ?? fallback
    if (number(troponin)! > limit) { ask("troponin", troponin, limit, "Myocardial ischaemia"); break }
  }

  // Not asked when the complication is already logged within an hour of the draw, or after a Not now.
  return questions.filter(question => {
    const dismissed = log.some(event => event.type === "prompt_answer" && event.answerKind === `lab:${question.kind}` && event.answerFor === question.key)
    if (dismissed) return false
    if (!question.complication) return true
    // The fallback timestamp for an unknown specimen is only the time the
    // question was prepared. It must not suppress the question because an
    // unrelated historical complication has an earlier chart time.
    if (!question.timeKnown) return !log.some(event => event.type === "complication" && event.id === labComplicationId(question))
    const at = Date.parse(question.ts)
    return !log.some(event => event.type === "complication" && event.label === question.complication
      && (Math.abs(Date.parse(event.ts) - at) <= 3_600_000 || (!event.endTs && Date.parse(event.ts) <= at)))
  })
}

export const labComplicationId = (question: LabQuestion) =>
  `lq-${question.kind}-${question.timeKnown ? Date.parse(question.ts) : question.key.replace(/[^a-z0-9]+/gi, "-")}`

/** What one answer writes: the complication at the draw's time, or the "Not now". */
export function labAnswerOps(question: LabQuestion, answer: "log" | "not_now", now: Date | string | number): IntraopEventOps {
  const none: IntraopEventOps = { add: [], update: [], remove: [] }
  const recordedAt = new Date(now).toISOString()
  if (answer === "not_now") {
    const stableQuestionId = question.key.replace(/[^a-z0-9]+/gi, "-")
    return { ...none, add: [{ id: `pa-lab-${question.kind}-${stableQuestionId}`, ts: question.ts, type: "prompt_answer", answerFor: question.key, answerKind: `lab:${question.kind}`, answer: "not_now", recordedAt }] }
  }
  if (!question.complication) return none
  const ts = question.timeKnown ? question.ts : recordedAt
  return {
    ...none,
    add: [{ id: labComplicationId(question), ts, type: "complication", label: question.complication, color: "#ef4444",
      complicationSource: "suggestion", suggestion: `lab:${question.kind}`, endTs: ts, recordedAt,
      ...(question.timeKnown ? {} : { value: "specimen time unknown" }) }],
  }
}

/** The question line, in the screen's language. Units in English in both. */
export function labQuestionText(question: LabQuestion, locale: string): string {
  const bg = locale === "bg"
  const unit = question.result.unit ? ` ${question.result.unit}` : ""
  const shown = `${question.result.test} ${question.value}${unit}`
  const unknownTime = question.timeKnown ? "" : (bg ? " · часът на пробата е неизвестен" : " · specimen time unknown")
  const word: Record<LabQuestionKind, [string, string]> = {
    hyperkalaemia: ["hyperkalaemia", "хиперкалиемия"], hypokalaemia: ["hypokalaemia", "хипокалиемия"],
    hypoglycaemia: ["hypoglycaemia", "хипогликемия"], hyperglycaemia: ["hyperglycaemia", "хипергликемия"],
    hypocalcaemia: ["hypocalcaemia", "хипокалциемия"], hyponatraemia: ["hyponatraemia", "хипонатриемия"],
    hypernatraemia: ["hypernatraemia", "хипернатриемия"], haemorrhage: ["massive haemorrhage", "масивна кръвозагуба"],
    lowFibrinogen: ["", ""], troponin: ["myocardial ischaemia", "миокардна исхемия"],
  }
  if (question.kind === "lowFibrinogen") return bg ? `${shown}${unknownTime}: фибриноген концентрат или криопреципитат?` : `${shown}${unknownTime}: give fibrinogen concentrate or cryoprecipitate?`
  if (question.fall != null) {
    return bg ? `${shown}${unknownTime}, спад с ${question.fall}${unit}: ${word.haemorrhage[1]}?` : `${shown}${unknownTime}, down ${question.fall}${unit}: log ${word.haemorrhage[0]}?`
  }
  return bg ? `${shown}${unknownTime}: ${word[question.kind][1]}?` : `${shown}${unknownTime}: log ${word[question.kind][0]}?`
}
