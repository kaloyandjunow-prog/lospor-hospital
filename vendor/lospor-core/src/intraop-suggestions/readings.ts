import { sortIntraopEvents } from "../intraop-engine"
import type { IntraopEventOps } from "../intraop-timetable-edit"
import type { LogEvent } from "../intraop-types"
import { FIXED_HEART_RATE, vitalBandFor } from "../vital-questions"
import { given, lastEvent, mhTriggerCharted, type SuggestionPatient, type SuggestionPreop } from "./context"

/**
 * Questions from the other readings (10.2.0, R1-R6), beside the 10.1.0
 * vitals questions and with the same rules: nothing is logged without a yes;
 * a yes to SpO2, EtCO2 or temperature starts one episode that stays open
 * while the readings stay out of range (when the clinician keeps logging on)
 * and closes at the first reading back in range or at the case end; after a
 * Not now, every later out-of-range reading asks again. Typed and imported
 * readings count alike; auto-filled copies never ask.
 *
 * - R1 SpO2 under 90% at every age: hypoxaemia. With cyanotic heart disease
 *   on the preop record the question says so.
 * - R2 EtCO2 above 60 mmHg: hypercapnia.
 * - R3 EtCO2 under 10 mmHg after 25 or more, with an airway in and before
 *   extubation: what happened?
 * - R4 Temperature under 36.0 °C: hypothermia.
 * - R5 The MH pattern, with a volatile or suxamethonium charted.
 * - R6 TOF under 0.9 around extubation, with a relaxant charted.
 */

export const SPO2_HYPOXAEMIA_BELOW = 90
export const ETCO2_HYPERCAPNIA_ABOVE = 60
export const ETCO2_NEAR_ZERO_BELOW = 10
export const ETCO2_NEAR_ZERO_FROM = 25
export const TEMP_HYPOTHERMIA_BELOW = 36
export const TOF_RECOVERED = 0.9

type EpisodeKind = "hypoxaemia" | "hypercapnia" | "hypothermia"

const EPISODE: Record<EpisodeKind, { label: string; sign: "spO2" | "etco2" | "temp"; out: (value: number) => boolean }> = {
  hypoxaemia: { label: "Hypoxia / desaturation", sign: "spO2", out: value => value < SPO2_HYPOXAEMIA_BELOW },
  hypercapnia: { label: "Hypercarbia", sign: "etco2", out: value => value > ETCO2_HYPERCAPNIA_ABOVE },
  hypothermia: { label: "Hypothermia", sign: "temp", out: value => value < TEMP_HYPOTHERMIA_BELOW },
}
export const READING_EPISODE_KINDS = Object.keys(EPISODE) as EpisodeKind[]

export const NEAR_ZERO_CHOICES = [
  "Circuit disconnection", "Accidental extubation", "Cardiac arrest", "Pulmonary embolism", "Venous air embolism",
] as const

export type ReadingQuestion =
  | { key: string; kind: EpisodeKind; reading: LogEvent; value: number; cyanotic?: boolean }
  | { key: string; kind: "nearZero"; reading: LogEvent; value: number; choices: readonly string[] }
  | { key: string; kind: "mh"; reading: LogEvent; etco2: number; heartRate: number; temperatureRising: boolean }
  | { key: string; kind: "residualBlock"; reading: LogEvent; value: number }
  | { key: string; kind: "reverseBeforeExtubation"; reading: LogEvent; value: number }

export type ReadingContext = {
  patient: SuggestionPatient
  preop: SuggestionPreop
  /** The clinician's setting: keep logging while the reading stays out of range. */
  keepLogging: boolean
  /** TOF monitoring ticked on the form (E3). */
  tofMonitor?: boolean
}

const ms = (value: string) => Date.parse(value)
const minutes = (value: number) => value * 60_000

function readings(log: LogEvent[], sign: "spO2" | "etco2" | "temp" | "heartRate" | "tofRatio"): LogEvent[] {
  return sortIntraopEvents(log).filter(event => event.type === "vital" && !event.autoFilled && typeof event[sign] === "number" && Number.isFinite(ms(event.ts)))
}

const answered = (log: LogEvent[], kind: string, readingId: string) =>
  log.some(event => event.type === "prompt_answer" && event.answerKind === `reading:${kind}` && event.answerFor === readingId)

const isOpenReadingEpisode = (event: LogEvent) => event.type === "complication" && event.complicationSource === "readings" && !event.endTs

function covered(log: LogEvent[], label: string, at: number): boolean {
  return log.some(event => {
    if (event.type !== "complication" || event.label !== label) return false
    const start = ms(event.ts)
    if (at < start) return false
    if (event.endTs) return at <= ms(event.endTs)
    return isOpenReadingEpisode(event) || isOpenVitalsLike(event) || at === start
  })
}
const isOpenVitalsLike = (event: LogEvent) => event.complicationSource === "vitals" && !event.endTs

/** An airway is in: one was placed and the patient has not been extubated since. */
function airwayInAt(log: LogEvent[], at: number): boolean {
  const placed = sortIntraopEvents(log).filter(event => event.type === "clinical_event" && ms(event.ts) <= at
    && ["Intubated", "LMA in", "DLT placed", "Reintubation", "Airway exchange", "Cricothyrotomy", "Needle cricothyrotomy"].includes(event.label ?? ""))
  if (placed.length === 0) return false
  const extubated = lastEvent(log, "Extubated", at)
  return !extubated || ms(extubated.ts) < ms(placed[placed.length - 1]!.ts)
}

function tachycardiaLimit(patient: SuggestionPatient): number {
  const band = vitalBandFor(patient.ageDays)
  return band ? FIXED_HEART_RATE[band.key].tachycardiaAbove : 100
}

/** R5: EtCO2 rising and a fast heart within 30 minutes, temperature optional. */
function mhPattern(log: LogEvent[], patient: SuggestionPatient): Extract<ReadingQuestion, { kind: "mh" }> | null {
  const etco2 = readings(log, "etco2")
  const hr = readings(log, "heartRate")
  const latest = etco2[etco2.length - 1]
  const latestHr = hr[hr.length - 1]
  if (!latest || !latestHr) return null
  const now = Math.max(ms(latest.ts), ms(latestHr.ts))
  const window = (events: LogEvent[], sign: "etco2" | "heartRate" | "temp") =>
    events.filter(event => now - ms(event.ts) <= minutes(30)).map(event => event[sign] as number)
  const etco2Values = window(etco2, "etco2")
  const hrValues = window(hr, "heartRate")
  const etco2Rising = latest.etco2! > ETCO2_HYPERCAPNIA_ABOVE || latest.etco2! - Math.min(...etco2Values) >= 10
  const fast = latestHr.heartRate! > tachycardiaLimit(patient) || latestHr.heartRate! >= 1.2 * Math.min(...hrValues)
  if (!etco2Rising || !fast) return null
  const temps = window(readings(log, "temp"), "temp")
  const temperatureRising = temps.length >= 2 && temps[temps.length - 1]! - Math.min(...temps) >= 0.5
  const reading = ms(latest.ts) >= ms(latestHr.ts) ? latest : latestHr
  return { key: `reading:mh:${reading.id}`, kind: "mh", reading, etco2: latest.etco2!, heartRate: latestHr.heartRate!, temperatureRising }
}

/** The readings questions waiting now. */
export function readingQuestions(log: LogEvent[], context: ReadingContext): ReadingQuestion[] {
  const questions: ReadingQuestion[] = []

  // R5 first: while it waits it replaces the separate hypercapnia question.
  let mh: Extract<ReadingQuestion, { kind: "mh" }> | null = null
  if (mhTriggerCharted(log) && !log.some(event => event.type === "complication" && event.label === "Malignant hyperthermia")) {
    const pattern = mhPattern(log, context.patient)
    if (pattern) {
      const dismissals = log.filter(event => event.type === "prompt_answer" && event.answerKind === "reading:mh")
      const last = dismissals[dismissals.length - 1]
      // After a Not now, ask again only if the pattern is worse: EtCO2 up 5 mmHg or the heart 10% faster.
      const worse = !last || pattern.etco2 >= Number(last.value?.split("/")[0] ?? 0) + 5
        || pattern.heartRate >= 1.1 * Number(last.value?.split("/")[1] ?? 0)
      if (worse) mh = pattern
    }
  }
  if (mh) questions.push(mh)

  for (const kind of READING_EPISODE_KINDS) {
    if (kind === "hypercapnia" && mh) continue
    const rule = EPISODE[kind]
    const list = readings(log, rule.sign)
    const reading = list[list.length - 1]
    if (!reading) continue
    const value = reading[rule.sign] as number
    if (!rule.out(value) || answered(log, kind, reading.id) || covered(log, rule.label, ms(reading.ts))) continue
    questions.push({
      key: `reading:${kind}:${reading.id}`, kind, reading, value,
      ...(kind === "hypoxaemia" && context.preop.cyanoticHeartDisease ? { cyanotic: true } : {}),
    })
  }

  // R3: a sudden fall to near zero with an airway in.
  const etco2 = readings(log, "etco2")
  const latest = etco2[etco2.length - 1]
  const previous = etco2[etco2.length - 2]
  if (latest && previous && latest.etco2! < ETCO2_NEAR_ZERO_BELOW && previous.etco2! >= ETCO2_NEAR_ZERO_FROM
    && airwayInAt(log, ms(latest.ts)) && !answered(log, "nearZero", latest.id)
    && !log.some(event => event.type === "complication" && NEAR_ZERO_CHOICES.includes(event.label as typeof NEAR_ZERO_CHOICES[number]) && ms(event.ts) >= ms(previous.ts))) {
    questions.push({ key: `reading:nearZero:${latest.id}`, kind: "nearZero", reading: latest, value: latest.etco2!, choices: NEAR_ZERO_CHOICES })
  }

  // R6 and E3: residual blockade around extubation, only after a relaxant.
  if (given(log, "nonDepolarising")) {
    const tof = readings(log, "tofRatio")
    const reading = tof[tof.length - 1]
    const extubated = lastEvent(log, "Extubated")
    const logged = log.some(event => event.type === "complication" && event.label === "Residual neuromuscular blockade")
    if (reading && reading.tofRatio! < TOF_RECOVERED && !logged) {
      const aroundExtubation = extubated != null && ms(reading.ts) >= ms(extubated.ts) - minutes(10)
      if (aroundExtubation && !answered(log, "residualBlock", reading.id)) {
        questions.push({ key: `reading:residualBlock:${reading.id}`, kind: "residualBlock", reading, value: reading.tofRatio! })
      } else if (!aroundExtubation && !extubated && !answered(log, "reverseBeforeExtubation", reading.id)) {
        questions.push({ key: `reading:reverseBeforeExtubation:${reading.id}`, kind: "reverseBeforeExtubation", reading, value: reading.tofRatio! })
      }
    }
    // E3: extubated with TOF monitoring, no reversal and no TOF of 0.9 or more.
    if (extubated && context.tofMonitor && !logged && !questions.some(question => question.kind === "residualBlock")) {
      const reversed = log.some(event => event.type === "drug" && (event.name === "Sugammadex" || event.name === "Neostigmine"))
      const recovered = tof.some(event => event.tofRatio! >= TOF_RECOVERED)
      if (!reversed && !recovered && !answered(log, "residualBlock", extubated.id)) {
        questions.push({ key: `reading:residualBlock:${extubated.id}`, kind: "residualBlock", reading: extubated, value: Number.NaN })
      }
    }
  }

  return questions.sort((a, b) => ms(a.reading.ts) - ms(b.reading.ts))
}

export const readingComplicationId = (kind: string, readingId: string) => `rd-${kind}-${readingId}`
export const readingPromptAnswerId = (kind: string, readingId: string) => `pa-reading-${kind}-${readingId}`

/** The complication a readings question logs on a yes (R3 needs the pick). */
export function readingComplicationLabel(question: ReadingQuestion): string | null {
  switch (question.kind) {
    case "hypoxaemia": case "hypercapnia": case "hypothermia": return EPISODE[question.kind].label
    case "mh": return "Malignant hyperthermia"
    case "residualBlock": return "Residual neuromuscular blockade"
    default: return null
  }
}

/** What one answer writes. R3: `{ log }` names the pick; "not_now" is also the artefact answer. */
export function readingAnswerOps(question: ReadingQuestion, answer: "log" | { log: string } | "not_now", context: Pick<ReadingContext, "keepLogging">, now: Date | string | number): IntraopEventOps {
  const none: IntraopEventOps = { add: [], update: [], remove: [] }
  const recordedAt = new Date(now).toISOString()
  const { reading } = question
  if (answer === "not_now") {
    const value = question.kind === "mh" ? `${question.etco2}/${question.heartRate}` : undefined
    return { ...none, add: [{ id: readingPromptAnswerId(question.kind, reading.id), ts: reading.ts, type: "prompt_answer", answerFor: reading.id, answerKind: `reading:${question.kind}`, answer: "not_now", recordedAt, ...(value ? { value } : {}) }] }
  }
  if (question.kind === "reverseBeforeExtubation") return none
  const label = question.kind === "nearZero"
    ? (typeof answer === "object" && question.choices.includes(answer.log) ? answer.log : null)
    : readingComplicationLabel(question)
  if (!label) return none
  const episode = question.kind === "hypoxaemia" || question.kind === "hypercapnia" || question.kind === "hypothermia"
  return {
    ...none,
    add: [{
      id: readingComplicationId(question.kind, reading.id),
      ts: reading.ts,
      type: "complication",
      label,
      color: "#ef4444",
      complicationSource: episode ? "readings" : "suggestion",
      suggestion: `reading:${question.kind}`,
      triggerReadingId: reading.id,
      ...(episode && context.keepLogging ? {} : { endTs: reading.ts }),
      recordedAt,
    }],
  }
}

/**
 * Closes open readings episodes at the first later reading back in range, or
 * at the case end. Run by the screen that holds the case after each save.
 */
export function readingEpisodeOps(log: LogEvent[], endedAt?: Date | string | number | null): IntraopEventOps {
  const update: LogEvent[] = []
  for (const episode of log.filter(isOpenReadingEpisode)) {
    const kind = READING_EPISODE_KINDS.find(candidate => EPISODE[candidate].label === episode.label)
    if (!kind) continue
    const rule = EPISODE[kind]
    const start = ms(episode.ts)
    const back = readings(log, rule.sign).find(reading => ms(reading.ts) > start && !rule.out(reading[rule.sign] as number))
    if (back) update.push({ ...episode, endTs: back.ts })
    else if (endedAt != null) {
      const end = new Date(endedAt).getTime()
      if (Number.isFinite(end) && end >= start) update.push({ ...episode, endTs: new Date(end).toISOString() })
    }
  }
  return { add: [], update, remove: [] }
}

/* ---------- words ---------- */

/** The question line, in the screen's language. Units in English in both. */
export function readingQuestionText(question: ReadingQuestion, locale: string): string {
  const bg = locale === "bg"
  switch (question.kind) {
    case "hypoxaemia":
      if (question.cyanotic) return bg ? `SpO₂ ${question.value}%: вписана е цианотична сърдечна болест. Записване на хипоксемия въпреки това?` : `SpO₂ ${question.value}%: cyanotic heart disease logged. Log hypoxaemia anyway?`
      return bg ? `SpO₂ ${question.value}%: хипоксемия?` : `SpO₂ ${question.value}%: log hypoxaemia?`
    case "hypercapnia": return bg ? `EtCO₂ ${question.value} mmHg: хиперкапния?` : `EtCO₂ ${question.value} mmHg: log hypercapnia?`
    case "hypothermia": return bg ? `Температура ${question.value} °C: хипотермия?` : `Temperature ${question.value} °C: log hypothermia?`
    case "nearZero": return bg ? `EtCO₂ ${question.value} mmHg: какво се случи?` : `EtCO₂ ${question.value} mmHg: what happened?`
    case "mh": return bg
      ? `EtCO₂ ${question.etco2} mmHg, СЧ ${question.heartRate}${question.temperatureRising ? ", температурата се покачва" : ""}: малигнена хипертермия ли е?`
      : `EtCO₂ ${question.etco2} mmHg, HR ${question.heartRate}${question.temperatureRising ? ", temperature rising" : ""}: is this malignant hyperthermia?`
    case "residualBlock": return Number.isFinite(question.value)
      ? (bg ? `TOF ${question.value}: остатъчен нервно-мускулен блок?` : `TOF ${question.value}: log residual neuromuscular blockade?`)
      : (bg ? "Екстубация без реверсия и без TOF 0,9: остатъчен блок?" : "Extubated with no reversal and no TOF of 0.9: residual blockade?")
    case "reverseBeforeExtubation": return bg ? `TOF ${question.value}: реверсия преди екстубация?` : `TOF ${question.value}: reverse before extubating?`
  }
}
