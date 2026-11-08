import {
  VITAL_QUESTION_KINDS,
  VITAL_SIGN_KEYS,
  vitalQuestionAutomationId,
  vitalQuestionAutomationEnabled,
  vitalQuestionsEnabled,
  type IntraopAutomationSettings,
  type UserAutomationSwitches,
  type VitalBandKey,
  type VitalQuestionKind,
  type VitalSignKey,
} from "./intraop-automation"
import type { IntraopEventOps } from "./intraop-timetable-edit"
import type { LogEvent } from "./intraop-types"

/**
 * Questions from vital signs (10.1.0): a reading outside the fixed rule or the
 * hospital's own statistical limit asks whether to log hypotension,
 * hypertension, bradycardia or tachycardia. Nothing is logged without a
 * clinician's yes; a yes starts one episode that the app keeps open while the
 * readings stay out of range and closes at the first reading back inside both
 * limits.
 *
 * The one place this is decided. The PWA and the web app list these questions
 * and write these operations through their save path, so they cannot differ.
 */

const YEAR = 365.25
const years = (value: number) => Math.round(value * YEAR)

export type VitalBand = {
  key: VitalBandKey
  labelEn: string
  labelBg: string
  /** Inclusive lower bound, in days of age. */
  fromDays: number
  /** Exclusive upper bound, in days of age; null for no upper bound. */
  toDays: number | null
}

export const VITAL_BANDS: readonly VitalBand[] = Object.freeze([
  { key: "NEWBORN", labelEn: "Newborn (0–28 days)", labelBg: "Новородени (0–28 дни)", fromDays: 0, toDays: 28 },
  { key: "INFANT", labelEn: "Infant (1–12 months)", labelBg: "Кърмачета (1–12 месеца)", fromDays: 28, toDays: years(1) },
  { key: "TODDLER", labelEn: "Toddler (1–2 years)", labelBg: "Малки деца (1–2 г.)", fromDays: years(1), toDays: years(3) },
  { key: "PRESCHOOL", labelEn: "Preschool (3–5 years)", labelBg: "Предучилищна възраст (3–5 г.)", fromDays: years(3), toDays: years(6) },
  { key: "SCHOOL", labelEn: "School age (6–11 years)", labelBg: "Училищна възраст (6–11 г.)", fromDays: years(6), toDays: years(12) },
  { key: "ADOLESCENT", labelEn: "Adolescent (12–17 years)", labelBg: "Юноши (12–17 г.)", fromDays: years(12), toDays: years(18) },
  { key: "ADULT", labelEn: "Adult (18–64 years)", labelBg: "Възрастни (18–64 г.)", fromDays: years(18), toDays: years(65) },
  { key: "OLDER", labelEn: "Older adult (65+ years)", labelBg: "Възрастни над 65 г.", fromDays: years(65), toDays: null },
])

export function vitalBandFor(ageDays: number | null | undefined): VitalBand | null {
  if (ageDays == null || !Number.isFinite(ageDays) || ageDays < 0) return null
  return VITAL_BANDS.find(band => ageDays >= band.fromDays && (band.toDays == null || ageDays < band.toDays)) ?? null
}

/** The patient's age in days from the preoperative record, as the unit indicators read it. */
export function preopAgeDays(preop: {
  ageValue?: number | null
  ageUnit?: string | null
  ageYears?: number | null
  ageApproxDays?: number | null
} | null | undefined): number | null {
  if (!preop) return null
  if (preop.ageApproxDays != null) return preop.ageApproxDays
  if (preop.ageValue != null && preop.ageUnit) {
    if (preop.ageUnit === "DAYS") return preop.ageValue
    if (preop.ageUnit === "MONTHS") return Math.round(preop.ageValue * 30.44)
    return Math.round(preop.ageValue * YEAR)
  }
  return preop.ageYears != null ? Math.round(preop.ageYears * YEAR + 182) : null
}

/**
 * The fixed heart-rate rules. Tachycardia: the top of the AHA PALS 2020 awake
 * range (infants 180, per the 2025 card); adults the standard 100. Bradycardia:
 * the thresholds intraoperative studies use in anaesthetised children, and 50
 * in adults, the working threshold under anaesthesia.
 */
export const FIXED_HEART_RATE: Readonly<Record<VitalBandKey, { tachycardiaAbove: number; bradycardiaBelow: number }>> = Object.freeze({
  NEWBORN: { tachycardiaAbove: 205, bradycardiaBelow: 100 },
  INFANT: { tachycardiaAbove: 180, bradycardiaBelow: 100 },
  TODDLER: { tachycardiaAbove: 140, bradycardiaBelow: 80 },
  PRESCHOOL: { tachycardiaAbove: 120, bradycardiaBelow: 70 },
  SCHOOL: { tachycardiaAbove: 118, bradycardiaBelow: 70 },
  ADOLESCENT: { tachycardiaAbove: 100, bradycardiaBelow: 60 },
  ADULT: { tachycardiaAbove: 100, bradycardiaBelow: 50 },
  OLDER: { tachycardiaAbove: 100, bradycardiaBelow: 50 },
})

/**
 * The fixed hypotension rule (AHA PALS 2020): systolic below 60 in newborns,
 * 70 in infants, 70 + 2 × age in years from 1 to 9 (the child's actual age),
 * 90 from 10 years; adults MAP below 65. There is no fixed hypertension rule.
 */
export function fixedHypotension(ageDays: number | null | undefined): { sign: "sbp" | "map"; below: number } | null {
  const band = vitalBandFor(ageDays)
  if (!band || ageDays == null) return null
  if (band.key === "NEWBORN") return { sign: "sbp", below: 60 }
  if (band.key === "INFANT") return { sign: "sbp", below: 70 }
  if (band.key === "ADULT" || band.key === "OLDER") return { sign: "map", below: 65 }
  const ageYears = Math.floor(ageDays / YEAR)
  return { sign: "sbp", below: ageYears <= 9 ? 70 + 2 * ageYears : 90 }
}

export const VITAL_COMPLICATION_KINDS = VITAL_QUESTION_KINDS
export type VitalComplicationKind = VitalQuestionKind

/** The complication each question logs, as the shared taxonomy names it. */
export const VITAL_COMPLICATION_LABEL: Readonly<Record<VitalComplicationKind, string>> = Object.freeze({
  hypotension: "Hypotension",
  hypertension: "Hypertension",
  bradycardia: "Bradycardia",
  tachycardia: "Tachycardia",
})

const KIND_SIGNS: Record<VitalComplicationKind, readonly VitalSignKey[]> = {
  hypotension: ["sbp", "dbp", "map"],
  hypertension: ["sbp", "dbp", "map"],
  bradycardia: ["hr"],
  tachycardia: ["hr"],
}
const LOW_KINDS = new Set<VitalComplicationKind>(["hypotension", "bradycardia"])

export function vitalComplicationKindOf(label: string | undefined): VitalComplicationKind | null {
  return VITAL_COMPLICATION_KINDS.find(kind => VITAL_COMPLICATION_LABEL[kind] === label) ?? null
}

/* ---------- statistics ---------- */

/** One band and sign: a count per whole-number value from `min` upwards, and the cases they came from. */
export type VitalHistogram = { min: number; counts: number[]; cases: number }
export type VitalStatsTable = Partial<Record<VitalBandKey, Partial<Record<VitalSignKey, VitalHistogram>>>>

export function histogramReadings(histogram: VitalHistogram): number {
  return histogram.counts.reduce((sum, count) => sum + count, 0)
}

export function histogramMeanSd(histogram: VitalHistogram): { mean: number; sd: number } | null {
  const n = histogramReadings(histogram)
  if (n < 2) return null
  let sum = 0
  histogram.counts.forEach((count, index) => { sum += count * (histogram.min + index) })
  const mean = sum / n
  let squares = 0
  histogram.counts.forEach((count, index) => { squares += count * (histogram.min + index - mean) ** 2 })
  return { mean, sd: Math.sqrt(squares / (n - 1)) }
}

/** The value at a percentile: the reading at that rank when all readings are sorted. */
export function histogramPercentile(histogram: VitalHistogram, percent: number): number | null {
  const n = histogramReadings(histogram)
  if (n === 0) return null
  const rank = Math.min(n - 1, Math.max(0, Math.floor(percent / 100 * n)))
  let seen = 0
  for (let index = 0; index < histogram.counts.length; index += 1) {
    seen += histogram.counts[index]
    if (seen > rank) return histogram.min + index
  }
  return histogram.min + histogram.counts.length - 1
}

/** The share of readings (0–100) strictly below, or strictly above, a value. */
export function histogramShare(histogram: VitalHistogram, value: number, side: "below" | "above"): number {
  const n = histogramReadings(histogram)
  if (n === 0) return 0
  let count = 0
  histogram.counts.forEach((c, index) => {
    const v = histogram.min + index
    if (side === "below" ? v < value : v > value) count += c
  })
  return count / n * 100
}

export type VitalSignLimits = {
  /** Flagged below this value; null when the statistics are not in use. */
  low: number | null
  /** Flagged above this value; null when the statistics are not in use. */
  high: number | null
  /** Enough cases in the band for the statistics to be used. */
  active: boolean
  cases: number
  readings: number
  mean: number | null
  sd: number | null
}

/** One band's statistical limits per sign, at the hospital's tail settings. */
export function vitalLimitsFor(
  stats: VitalStatsTable | null | undefined,
  settings: IntraopAutomationSettings,
  band: VitalBandKey,
): Record<VitalSignKey, VitalSignLimits> {
  const out = {} as Record<VitalSignKey, VitalSignLimits>
  for (const sign of VITAL_SIGN_KEYS) {
    const histogram = stats?.[band]?.[sign]
    const readings = histogram ? histogramReadings(histogram) : 0
    const cases = histogram?.cases ?? 0
    const summary = histogram ? histogramMeanSd(histogram) : null
    const active = !!histogram && readings > 0 && cases >= settings.vitalQuestions.minCases
    const tail = settings.vitalQuestions.tails[band][sign]
    out[sign] = {
      low: active ? histogramPercentile(histogram!, tail.low) : null,
      high: active ? histogramPercentile(histogram!, 100 - tail.high) : null,
      active,
      cases,
      readings,
      mean: summary?.mean ?? null,
      sd: summary?.sd ?? null,
    }
  }
  return out
}

/* ---------- one reading ---------- */

export function meanArterialPressure(systolic: number, diastolic: number): number {
  return Math.round((systolic + 2 * diastolic) / 3)
}

type PressureFields = Pick<LogEvent, "systolic" | "diastolic" | "ibpSystolic" | "ibpDiastolic" | "ibpMap" | "nibpMap">

/**
 * The lowest pressure a reading carries, from the cuff and the arterial line (10.2.0). A low pressure
 * on either counts, so each sign takes the lower of the two; the mean is the lowest of the stored
 * means and the one worked out from each complete pair.
 */
export function lowestPressure(event: Partial<PressureFields>): { sbp?: number; dbp?: number; map?: number } {
  return pressureBy(event, Math.min)
}

/**
 * The highest pressure a reading carries: what hypertension is judged on. A high pressure on either the
 * cuff or the arterial line counts, so each sign takes the higher of the two.
 */
export function highestPressure(event: Partial<PressureFields>): { sbp?: number; dbp?: number; map?: number } {
  return pressureBy(event, Math.max)
}

function pressureBy(event: Partial<PressureFields>, pick: (...values: number[]) => number): { sbp?: number; dbp?: number; map?: number } {
  const of = (...values: Array<number | null | undefined>): number | undefined => {
    const present = values.filter((value): value is number => typeof value === "number")
    return present.length > 0 ? pick(...present) : undefined
  }
  const pair = (sbp: number | undefined, dbp: number | undefined) => (sbp != null && dbp != null ? meanArterialPressure(sbp, dbp) : undefined)
  return {
    sbp: of(event.systolic, event.ibpSystolic),
    dbp: of(event.diastolic, event.ibpDiastolic),
    map: of(pair(event.systolic ?? undefined, event.diastolic ?? undefined), pair(event.ibpSystolic ?? undefined, event.ibpDiastolic ?? undefined), event.nibpMap, event.ibpMap),
  }
}

/**
 * The signs a vital reading carries, MAP worked out from systolic and diastolic when none is stored. With
 * both a cuff and an arterial line, "low" takes the lower of the two (hypotension) and "high" the higher
 * (hypertension).
 */
export function vitalReadingValues(event: Pick<LogEvent, "heartRate"> & Partial<PressureFields>, side: "low" | "high" = "low"): Partial<Record<VitalSignKey, number>> {
  const values: Partial<Record<VitalSignKey, number>> = {}
  if (typeof event.heartRate === "number") values.hr = event.heartRate
  const pressure = side === "high" ? highestPressure(event) : lowestPressure(event)
  if (pressure.sbp != null) values.sbp = pressure.sbp
  if (pressure.dbp != null) values.dbp = pressure.dbp
  if (pressure.map != null) values.map = pressure.map
  return values
}

export type VitalTrigger = {
  sign: VitalSignKey
  value: number
  rule: "fixed" | "statistics" | "baseline"
  /** The limit crossed. */
  limit: number
  /** For the baseline rule: the patient's own value it was measured from. */
  reference?: number
}

export type VitalFinding = {
  kind: VitalComplicationKind
  triggers: VitalTrigger[]
  /** Per sign that crossed: the value it must reach again for automatic logging to stop (inside both limits). */
  stopAt: { sign: VitalSignKey; value: number; direction: "atLeast" | "atMost" }[]
}

export type VitalEvaluationContext = {
  ageDays: number | null
  /** The band's statistical limits; null when statistics are not loaded. */
  limits: Record<VitalSignKey, VitalSignLimits> | null
  /** The patient's own SBP and MAP before anaesthesia, for the hypertension rule. */
  baseline?: PressureBaseline | null
  /** Percent above the baseline that counts as hypertension (Status, 10-50). */
  hypertensionPercent?: number
}

/**
 * Hypertension is judged against the patient's own baseline only (10.2.0).
 * The hospital-statistics rule for hypertension is kept but switched off: the
 * top of a hospital's readings says little about one patient's pressure.
 * Hypotension keeps its fixed age rule and the statistics, both on.
 */
export const HYPERTENSION_USES_STATISTICS = false

export type PressureBaseline = { sbp?: number; map?: number; source: "preop" | "first" }

/**
 * The patient's baseline: the preoperative BP when it was entered, otherwise
 * the first BP charted in theatre (never an auto-filled copy). MAP is worked out
 * from systolic and diastolic, or read as charted.
 *
 * The first reading is taken from the same side hypertension is judged on (the higher of the cuff and the arterial
 * line). Taken from the lower side, an arterial line that simply reads higher than the cuff would push every later
 * reading over the limit with no change in the patient.
 */
export function pressureBaseline(
  log: LogEvent[],
  preop?: { systolic?: number | null; diastolic?: number | null } | null,
): PressureBaseline | null {
  if (typeof preop?.systolic === "number" && preop.systolic > 0) {
    return {
      sbp: preop.systolic,
      ...(typeof preop.diastolic === "number" && preop.diastolic > 0 ? { map: meanArterialPressure(preop.systolic, preop.diastolic) } : {}),
      source: "preop",
    }
  }
  for (const reading of questionReadings(log)) {
    const values = vitalReadingValues(reading, "high")
    if (values.sbp != null || values.map != null) {
      return { ...(values.sbp != null ? { sbp: values.sbp } : {}), ...(values.map != null ? { map: values.map } : {}), source: "first" }
    }
  }
  return null
}

/** The value above which a sign is hypertensive for this patient. */
export function hypertensionBaselineLimit(baseline: number, percent: number): number {
  return Math.round(baseline * (1 + percent / 100))
}

/** Every complication a reading points to, with what crossed which limit. Several at once is normal. */
export function evaluateVitalReading(
  event: Pick<LogEvent, "heartRate"> & Partial<PressureFields>,
  context: VitalEvaluationContext,
): VitalFinding[] {
  const band = vitalBandFor(context.ageDays)
  if (!band) return []
  const lowValues = vitalReadingValues(event, "low")
  const highValues = vitalReadingValues(event, "high")
  const hypo = fixedHypotension(context.ageDays)
  const hr = FIXED_HEART_RATE[band.key]
  const fixedLow = (kind: VitalComplicationKind, sign: VitalSignKey): number | null => {
    if (kind === "hypotension") return hypo && hypo.sign === sign ? hypo.below : null
    if (kind === "bradycardia") return sign === "hr" ? hr.bradycardiaBelow : null
    return null
  }
  const fixedHigh = (kind: VitalComplicationKind, sign: VitalSignKey): number | null =>
    kind === "tachycardia" && sign === "hr" ? hr.tachycardiaAbove : null

  const findings: VitalFinding[] = []
  for (const kind of VITAL_COMPLICATION_KINDS) {
    const low = LOW_KINDS.has(kind)
    const values = low ? lowValues : highValues
    const triggers: VitalTrigger[] = []
    const stopAt: VitalFinding["stopAt"] = []
    for (const sign of KIND_SIGNS[kind]) {
      const value = values[sign]
      if (value == null) continue
      const fixed = low ? fixedLow(kind, sign) : fixedHigh(kind, sign)
      const statsAllowed = kind !== "hypertension" || HYPERTENSION_USES_STATISTICS
      const statsLimit = statsAllowed && context.limits?.[sign]?.active ? (low ? context.limits[sign].low : context.limits[sign].high) : null
      const reference = kind === "hypertension" && (sign === "sbp" || sign === "map") ? context.baseline?.[sign] : undefined
      const baselineLimit = reference != null && context.hypertensionPercent != null
        ? hypertensionBaselineLimit(reference, context.hypertensionPercent)
        : null
      const crossed: VitalTrigger[] = []
      if (fixed != null && (low ? value < fixed : value > fixed)) crossed.push({ sign, value, rule: "fixed", limit: fixed })
      if (statsLimit != null && (low ? value < statsLimit : value > statsLimit)) crossed.push({ sign, value, rule: "statistics", limit: statsLimit })
      if (baselineLimit != null && value > baselineLimit) crossed.push({ sign, value, rule: "baseline", limit: baselineLimit, reference })
      if (crossed.length === 0) continue
      triggers.push(...crossed)
      const bounds = [fixed, statsLimit, baselineLimit].filter((limit): limit is number => limit != null)
      stopAt.push(low
        ? { sign, value: Math.max(...bounds), direction: "atLeast" }
        : { sign, value: Math.min(...bounds), direction: "atMost" })
    }
    if (triggers.length > 0) findings.push({ kind, triggers, stopAt })
  }
  return findings
}

/* ---------- the questions ---------- */

export type VitalQuestionContext = {
  settings: IntraopAutomationSettings
  user?: UserAutomationSwitches | null
  stats: VitalStatsTable | null
  ageDays: number | null
  /** The clinician's setting: keep logging while the reading stays out of range. */
  keepLogging: boolean
  /** The preoperative BP, the first choice of baseline for the hypertension rule. */
  preopPressure?: { systolic?: number | null; diastolic?: number | null } | null
}

export type VitalQuestion = {
  key: string
  kind: VitalComplicationKind
  reading: LogEvent
  finding: VitalFinding
  limits: Record<VitalSignKey, VitalSignLimits> | null
  /** The band's readings per sign, for the percentage in the question. */
  histograms: Partial<Record<VitalSignKey, VitalHistogram>>
  band: VitalBand
}

function evaluationContext(context: VitalQuestionContext, log: LogEvent[]): VitalEvaluationContext & { band: VitalBand | null } {
  const band = vitalBandFor(context.ageDays)
  return {
    ageDays: context.ageDays,
    band,
    limits: band ? vitalLimitsFor(context.stats, context.settings, band.key) : null,
    baseline: pressureBaseline(log, context.preopPressure),
    hypertensionPercent: context.settings.vitalQuestions.hypertensionBaselinePercent,
  }
}

const ms = (value: string | undefined) => (value ? Date.parse(value) : Number.NaN)

/** Readings a question can come from: charted vitals with a heart rate or any
 * pressure source (cuff, arterial line or stored MAP), never auto-filled
 * copies. Keep the field decision in vitalReadingValues so the question path
 * cannot drift from the displayed/analysed pressure semantics. */
function questionReadings(log: LogEvent[]): LogEvent[] {
  return log
    .filter(event => event.type === "vital" && !event.autoFilled
      && Object.keys(vitalReadingValues(event)).length > 0)
    .filter(event => Number.isFinite(ms(event.ts)))
    .sort((a, b) => ms(a.ts) - ms(b.ts) || (a.sequence ?? 0) - (b.sequence ?? 0))
}

function carries(event: LogEvent, kind: VitalComplicationKind): boolean {
  const values = vitalReadingValues(event)
  return KIND_SIGNS[kind].some(sign => values[sign] != null)
}

/** The complication events in a log, in time order. */
export function intraopComplicationEvents(log: LogEvent[]): LogEvent[] {
  return log.filter(event => event.type === "complication" && Number.isFinite(ms(event.ts)))
    .sort((a, b) => ms(a.ts) - ms(b.ts))
}

/** An open episode: logged from the vitals questions and not yet closed. */
export function isOpenVitalEpisode(event: LogEvent): boolean {
  return event.type === "complication" && event.complicationSource === "vitals" && !event.endTs
}

function covers(event: LogEvent, at: number): boolean {
  const start = ms(event.ts)
  if (at < start) return false
  if (event.endTs) return at <= ms(event.endTs)
  return isOpenVitalEpisode(event) || at === start
}

/** Deterministic ids, so an answer replayed offline lands on the same entry instead of a second one. */
export const vitalComplicationId = (readingId: string, kind: VitalComplicationKind) => `vq-${kind}-${readingId}`
export const vitalPromptAnswerId = (readingId: string, kind: VitalComplicationKind) => `pa-${kind}-${readingId}`

/**
 * The questions waiting now: for each complication, the latest reading that
 * carries its signs, when that reading crosses a limit, is not inside an
 * episode of the same complication, and has not been answered "Not now".
 */
export function vitalQuestions(log: LogEvent[], context: VitalQuestionContext | null | undefined): VitalQuestion[] {
  if (!context || !vitalQuestionsEnabled(context.settings, context.user)) return []
  const evaluation = evaluationContext(context, log)
  if (!evaluation.band) return []
  const readings = questionReadings(log)
  const complications = intraopComplicationEvents(log)
  const answered = new Set(log.filter(event => event.type === "prompt_answer").map(event => `${event.answerKind}:${event.answerFor}`))
  const questions: VitalQuestion[] = []
  for (const kind of VITAL_COMPLICATION_KINDS) {
    if (!vitalQuestionAutomationEnabled(context.settings, context.user, kind)) continue
    const reading = [...readings].reverse().find(event => carries(event, kind))
    if (!reading) continue
    const finding = evaluateVitalReading(reading, evaluation).find(item => item.kind === kind)
    if (!finding) continue
    if (answered.has(`${kind}:${reading.id}`)) continue
    const at = ms(reading.ts)
    if (complications.some(event => vitalComplicationKindOf(event.label) === kind && covers(event, at))) continue
    questions.push({
      key: `vital:${kind}:${reading.id}`,
      kind,
      reading,
      finding,
      limits: evaluation.limits,
      histograms: context.stats?.[evaluation.band.key] ?? {},
      band: evaluation.band,
    })
  }
  return questions.sort((a, b) => ms(a.reading.ts) - ms(b.reading.ts)
    || VITAL_COMPLICATION_KINDS.indexOf(a.kind) - VITAL_COMPLICATION_KINDS.indexOf(b.kind))
}

export type VitalAnswer = "log_complication" | "not_now"

/** What one answer writes: the complication (an open episode when logging continues), or the "Not now". */
export function vitalAnswerOps(
  question: Pick<VitalQuestion, "kind" | "reading">,
  answer: VitalAnswer,
  context: Pick<VitalQuestionContext, "keepLogging">,
  now: Date | string | number,
): IntraopEventOps {
  const recordedAt = new Date(now).toISOString()
  const { kind, reading } = question
  if (answer === "not_now") {
    return {
      add: [{ id: vitalPromptAnswerId(reading.id, kind), ts: reading.ts, type: "prompt_answer", answerFor: reading.id, answerKind: kind, answer: "not_now", suggestion: vitalQuestionAutomationId(kind), recordedAt }],
      update: [],
      remove: [],
    }
  }
  return {
    add: [{
      id: vitalComplicationId(reading.id, kind),
      ts: reading.ts,
      type: "complication",
      label: VITAL_COMPLICATION_LABEL[kind],
      color: "#ef4444",
      complicationSource: "vitals",
      triggerReadingId: reading.id,
      suggestion: vitalQuestionAutomationId(kind),
      ...(context.keepLogging ? {} : { endTs: reading.ts }),
      recordedAt,
    }],
    update: [],
    remove: [],
  }
}

/**
 * Closes open episodes: at the first later reading back inside both limits,
 * or at the case end when the readings never came back. Run by the screen
 * that holds the case after each save; empty when there is nothing to close.
 */
export function vitalEpisodeOps(
  log: LogEvent[],
  context: VitalQuestionContext | null | undefined,
  endedAt?: Date | string | number | null,
): IntraopEventOps {
  const none: IntraopEventOps = { add: [], update: [], remove: [] }
  if (!context || !vitalQuestionsEnabled(context.settings, context.user)) return none
  const evaluation = evaluationContext(context, log)
  if (!evaluation.band) return none
  const readings = questionReadings(log)
  const update: LogEvent[] = []
  for (const episode of log.filter(isOpenVitalEpisode)) {
    const kind = vitalComplicationKindOf(episode.label)
    if (!kind) continue
    const start = ms(episode.ts)
    const back = readings.find(reading => ms(reading.ts) > start && carries(reading, kind)
      && !evaluateVitalReading(reading, evaluation).some(item => item.kind === kind))
    if (back) {
      update.push({ ...episode, endTs: back.ts })
    } else if (endedAt != null) {
      const end = new Date(endedAt)
      if (Number.isFinite(end.getTime()) && end.getTime() >= start) update.push({ ...episode, endTs: end.toISOString() })
    }
  }
  return { ...none, update }
}

/* ---------- words ---------- */

const SIGN_NAME: Record<VitalSignKey, { en: string; bg: string }> = {
  hr: { en: "HR", bg: "СЧ" },
  sbp: { en: "SBP", bg: "Сис" },
  dbp: { en: "DBP", bg: "Диас" },
  map: { en: "MAP", bg: "САН" },
}

/** A sign's short name as the chart writes it in that language: HR / СЧ. */
export function vitalSignAbbreviation(sign: VitalSignKey, locale: string): string {
  return SIGN_NAME[sign][locale === "bg" ? "bg" : "en"]
}
const SIGN_UNIT: Record<VitalSignKey, string> = { hr: "bpm", sbp: "mmHg", dbp: "mmHg", map: "mmHg" }

const KIND_WORD: Record<VitalComplicationKind, { en: string; bg: string }> = {
  hypotension: { en: "Hypotension", bg: "Хипотенсия" },
  hypertension: { en: "Hypertension", bg: "Хипертенсия" },
  bradycardia: { en: "Bradycardia", bg: "Брадикардия" },
  tachycardia: { en: "Tachycardia", bg: "Тахикардия" },
}

export function vitalComplicationWord(kind: VitalComplicationKind, locale: string): string {
  return KIND_WORD[kind][locale === "bg" ? "bg" : "en"]
}

function percentText(value: number): string {
  return value >= 99.95 ? "99.9" : value.toFixed(1)
}

/**
 * The words of one question, in the screen's language: what was read, why it
 * is unusual (percentile and SD from the hospital's own readings, or the
 * fixed rule), and, when logging continues, the value that stops it.
 */
export function vitalQuestionText(
  question: VitalQuestion,
  locale: string,
  keepLogging: boolean,
): { title: string; detail: string; stop: string | null } {
  const bg = locale === "bg"
  const name = (sign: VitalSignKey) => vitalSignAbbreviation(sign, locale)
  const { finding, band, limits } = question
  const lead = finding.triggers[0]
  const low = LOW_KINDS.has(question.kind)
  const values = vitalReadingValues(question.reading)
  const shown = question.kind === "bradycardia" || question.kind === "tachycardia"
    ? `${name("hr")} ${values.hr}`
    : values.sbp != null && values.dbp != null ? `${values.sbp}/${values.dbp} (${name("map")} ${values.map})` : `${name(lead.sign)} ${lead.value}`
  const title = bg
    ? `${shown}: ${vitalComplicationWord(question.kind, "bg")}?`
    : `${shown}: log ${vitalComplicationWord(question.kind, "en").toLowerCase()}?`

  const statistical = finding.triggers.find(trigger => trigger.rule === "statistics")
  const fromBaseline = finding.triggers.find(trigger => trigger.rule === "baseline")
  const bandLabel = bg ? band.labelBg : band.labelEn
  let detail: string
  if (fromBaseline && fromBaseline.reference != null) {
    const rise = Math.round((fromBaseline.value / fromBaseline.reference - 1) * 100)
    detail = bg
      ? `${name(fromBaseline.sign)} ${fromBaseline.value} е с ${rise}% над изходната стойност ${fromBaseline.reference} ${SIGN_UNIT[fromBaseline.sign]} (граница ${fromBaseline.limit})`
      : `${name(fromBaseline.sign)} ${fromBaseline.value} is ${rise}% above the baseline of ${fromBaseline.reference} ${SIGN_UNIT[fromBaseline.sign]} (limit ${fromBaseline.limit})`
  } else if (statistical && limits) {
    const sign = statistical.sign
    const signLimits = limits[sign]
    const histogram = question.histograms[sign]
    const sd = signLimits.mean != null && signLimits.sd ? (statistical.value - signLimits.mean) / signLimits.sd : null
    const sdText = sd == null ? "" : ` (${sd >= 0 ? "+" : "−"}${Math.abs(sd).toFixed(1)} SD)`
    const pct = histogram ? percentText(histogramShare(histogram, statistical.value, low ? "above" : "below")) : null
    detail = bg
      ? `${name(sign)} ${statistical.value} е ${low ? "по-ниско" : "по-високо"} от ${pct ?? "—"}% от отчитанията тук${sdText} · ${bandLabel}`
      : `${name(sign)} ${statistical.value} is ${low ? "lower" : "higher"} than ${pct ?? "—"}% of readings here${sdText} · ${bandLabel}`
  } else {
    detail = bg
      ? `${name(lead.sign)} ${lead.value} е ${low ? "под" : "над"} фиксираната граница от ${lead.limit} ${SIGN_UNIT[lead.sign]} · ${bandLabel}`
      : `${name(lead.sign)} ${lead.value} is ${low ? "below" : "above"} the fixed limit of ${lead.limit} ${SIGN_UNIT[lead.sign]} · ${bandLabel}`
  }

  const stop = keepLogging && finding.stopAt.length > 0
    ? (bg
      ? `Автоматичното записване спира, когато ${finding.stopAt.map(item => `${name(item.sign)} е ${item.direction === "atLeast" ? `${item.value} или повече` : `${item.value} или по-малко`}`).join(" и ")}.`
      : `Automatic logging stops when ${finding.stopAt.map(item => `${name(item.sign)} is ${item.value} or ${item.direction === "atLeast" ? "higher" : "lower"}`).join(" and ")}.`)
    : null
  return { title, detail, stop }
}
