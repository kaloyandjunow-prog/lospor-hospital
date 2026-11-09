import {
  intraopCascadeDeleteIds,
  intraopItemRef,
  intraopConfirmStop,
  intraopEventsAfter,
  intraopMoveToEnd,
  intraopUnconfirmedStops,
} from "./intraop-commands"
import { sortIntraopEvents } from "./intraop-engine"
import { resolveIntraopEventLabel } from "./clinical-display"
import { clinicalDisplayLabel } from "./display"
import type { ClinicalDisplayDomain, ClinicalLocale } from "./display/types"
import type { IntraopEventOps } from "./intraop-timetable-edit"
import type { LogEvent } from "./intraop-types"
import {
  vitalAnswerOps,
  vitalQuestions,
  vitalQuestionText,
  type VitalQuestion,
  type VitalQuestionContext,
} from "./vital-questions"
import { glucoseReminderText, ponvReminderText } from "./intraop-suggestions/reminders"
import { labQuestionText } from "./intraop-suggestions/labs"
import { readingQuestionText } from "./intraop-suggestions/readings"
import { timerText } from "./intraop-suggestions/timers"
import {
  suggestionDismissOps,
  suggestionLines,
  suggestionLogOps,
  type SuggestionContext,
  type SuggestionLine,
} from "./intraop-suggestions/waiting"
import { contextLinkText } from "./intraop-suggestions/context-links"

/**
 * What on the intraoperative timeline is waiting for a clinician's answer, and
 * what each answer writes (9.13.0).
 *
 * The one place this is decided. The PWA and the web app list exactly these
 * items and write exactly these operations through their save path; neither
 * works out its own. Before 9.13.0 each app had its own after-end list -- the
 * web one built from the drawn chart, the PWA one from the events -- and they
 * disagreed: a planned rate change after the end was on one and not the other.
 *
 * - An unconfirmed stop (entered ahead of its time, time reached): it
 *   stopped, or it is still running.
 * - An entry dated after the case end: it happened (moved to the end), or it
 *   did not (deleted, with whatever depends on it).
 */

export type IntraopAttentionKind = "unconfirmed_stop" | "after_end" | "vital_deviation" | "suggestion"

export type IntraopAttentionAction =
  | "stopped" | "still_running" | "happened" | "did_not_happen"
  // 10.1.0: a reading outside its limits -- log the complication, or not now.
  | "log_complication" | "not_now"
  // 10.2.0: a card, checklist, reminder or follow-up opens; nothing is written until Save.
  | "open"
  // Context links are case-scoped prompts: unlike ordinary questions they are
  // definitively dismissed, so the label is Dismiss / Откажи in both clients.
  | "dismiss"

export type IntraopAttentionItem = {
  /** The event's id: stable while the item waits. */
  key: string
  kind: IntraopAttentionKind
  event: LogEvent
  /**
   * What the question is about: the drug, fluid or agent named when it was
   * started. A stop event carries no name of its own, and "Infusion stopped"
   * does not say which one.
   */
  subject?: string
  actions: readonly IntraopAttentionAction[]
  /** A question from the vitals (10.1.0): which complication, and why. */
  vital?: VitalQuestion
  /** A suggestion (10.2.0): a card, a question, a reminder or a follow-up. */
  suggestion?: SuggestionLine
}

export type IntraopAttentionContext = {
  /** The reading time (server-corrected "now"). */
  now: Date | string | number
  /** The case end, once ended. */
  endedAt?: Date | string | number | null
  /**
   * The vitals questions (10.1.0), when the hospital has them on and this
   * screen holds the case. Absent: no such questions are asked.
   */
  vitals?: VitalQuestionContext | null
  /**
   * The suggestions (10.2.0), when the hospital has any group on and this
   * screen holds the case. Absent: none are asked.
   */
  suggestions?: SuggestionContext | null
}

const STOP_ACTIONS = ["stopped", "still_running"] as const
const AFTER_END_ACTIONS = ["happened", "did_not_happen"] as const
const VITAL_ACTIONS = ["not_now", "log_complication"] as const
const OPEN_ACTIONS = ["not_now", "open"] as const
const CONTEXT_ACTIONS = ["dismiss", "open"] as const

export function intraopAttentionItems(log: LogEvent[], context: IntraopAttentionContext): IntraopAttentionItem[] {
  const ended = context.endedAt != null
  const asOf = ended ? context.endedAt! : context.now
  const items: IntraopAttentionItem[] = []
  const listed = new Set<string>()
  for (const event of intraopUnconfirmedStops(log, asOf)) {
    items.push({ key: event.id, kind: "unconfirmed_stop", event, actions: STOP_ACTIONS })
    listed.add(event.id)
  }
  if (ended) {
    for (const event of intraopEventsAfter(log, context.endedAt!)) {
      if (listed.has(event.id)) continue
      items.push({ key: event.id, kind: "after_end", event, actions: AFTER_END_ACTIONS })
    }
  }
  const order = new Map(sortIntraopEvents(log).map((event, index) => [event.id, index]))
  const subjectOf = subjects(log)
  const timeline = items
    .map(item => {
      const subject = subjectOf(item.event)
      return subject ? { ...item, subject } : item
    })
    .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
  const suggestions = suggestionLines(log, context.suggestions).map((line): IntraopAttentionItem => ({
    key: line.key,
    kind: "suggestion",
    event: suggestionEvent(line),
    actions: line.item.type === "context"
      ? CONTEXT_ACTIONS
      : line.item.type === "card" || line.item.type === "reminder" || line.item.type === "timer"
      || (line.item.type === "reading" && line.item.question.kind === "reverseBeforeExtubation")
      || (line.item.type === "lab" && line.item.question.complication == null)
      ? OPEN_ACTIONS
      : VITAL_ACTIONS,
    suggestion: line,
  }))
  // While the MH question waits it replaces the separate tachycardia question.
  const mhWaiting = suggestions.some(item => item.suggestion?.item.type === "reading" && item.suggestion.item.question.kind === "mh")
  // Questions from the vitals follow, in the order of their readings.
  const vital = vitalQuestions(log, context.vitals).filter(question => !(mhWaiting && question.kind === "tachycardia")).map((question): IntraopAttentionItem => ({
    key: question.key,
    kind: "vital_deviation",
    event: question.reading,
    actions: VITAL_ACTIONS,
    vital: question,
  }))
  return [...timeline, ...vital, ...suggestions]
}

/** The entry a suggestion line is about, for the list's time column. */
function suggestionEvent(line: SuggestionLine): LogEvent {
  const item = line.item
  switch (item.type) {
    case "card": return item.complication
    case "reverse": return item.question.trigger
    case "reading": return item.question.reading
    default: return { id: line.key, ts: line.ts, type: "prompt_answer" }
  }
}

/** The drug, fluid or agent an event is about, named by its start when it carries no name. */
function subjects(log: LogEvent[]): (event: LogEvent) => string | undefined {
  const names = new Map<string, string>()
  for (const event of sortIntraopEvents(log)) {
    const ref = intraopItemRef(event)
    if (ref?.role === "start" && event.name) names.set(`${ref.kind}:${ref.key}`, event.name)
  }
  return event => {
    const ref = intraopItemRef(event)
    return event.name ?? (ref ? names.get(`${ref.kind}:${ref.key}`) : undefined)
  }
}

/**
 * The operations one answer writes. Empty when the item is no longer waiting
 * (answered on another screen meanwhile) or the answer does not fit it.
 */
export function intraopResolveAttention(
  log: LogEvent[],
  key: string,
  action: IntraopAttentionAction,
  context: IntraopAttentionContext,
  /** A question with several answers (a shock, EtCO2 near zero): the complication picked. */
  choice?: string,
): IntraopEventOps {
  const none: IntraopEventOps = { add: [], update: [], remove: [] }
  const item = intraopAttentionItems(log, context).find(candidate => candidate.key === key)
  if (!item || !item.actions.includes(action)) return none
  const recordedAt = new Date(context.now).toISOString()
  if (item.suggestion) {
    const keep = { keepLogging: context.suggestions?.keepLogging ?? true }
    if (action === "not_now" || action === "dismiss") return suggestionDismissOps(item.suggestion, keep, context.now)
    if (action === "log_complication") return suggestionLogOps(item.suggestion, choice, keep, context.now)
    return none
  }
  if (item.vital) {
    return action === "log_complication" || action === "not_now"
      ? vitalAnswerOps(item.vital, action, { keepLogging: context.vitals?.keepLogging ?? true }, context.now)
      : none
  }
  switch (action) {
    case "stopped":
      return { ...none, update: [{ ...intraopConfirmStop(item.event), recordedAt: item.event.recordedAt ?? recordedAt }] }
    case "still_running":
      // Withdrawing the stop is exactly how Resume removes one: the item runs on.
      return { ...none, remove: [item.event.id] }
    case "did_not_happen":
      // A planned start takes its changes and stop with it.
      return { ...none, remove: intraopCascadeDeleteIds(log, item.event.id) }
    case "happened": {
      const moved = intraopMoveToEnd(item.event, context.endedAt ?? context.now)
      const { stopConfirmed: _confirmed, ...rest } = moved
      return { ...none, update: [{ ...rest, recordedAt }] }
    }
    default:
      return none
  }
}

// Event-type terms whose change events are named for the item they change.
const EVENT_TERM: Partial<Record<LogEvent["type"], string>> = { infusion_rate: "infusion_change" }

const SUBJECT_DOMAIN: Partial<Record<string, ClinicalDisplayDomain>> = {
  infusion: "option:INTRAOP_INFUSION",
  fluid: "option:INTRAOP_FLUID",
  agent: "option:INHALATIONAL_AGENT",
}

/**
 * The line each app shows for a question, in the language of the screen
 * (9.13.0): what it is about and what was entered -- "Remifentanil ·
 * Спиране на инфузия". One function, so the PWA and the web app say the
 * same thing in the same words, in Bulgarian as in English.
 */
export function intraopAttentionText(item: IntraopAttentionItem, locale: string): string {
  const language: ClinicalLocale = locale === "bg" ? "bg" : "en"
  if (item.vital) return vitalQuestionText(item.vital, language, false).title
  if (item.suggestion) return suggestionText(item.suggestion, language)
  const event = item.event
  if (event.type === "drug") {
    const name = event.name ? clinicalDisplayLabel("option:INTRAOP_DRUG", event.name, language, { label: event.name }) : ""
    return `${name} ${event.dose ?? ""} ${event.unit ?? ""}`.trim()
  }
  if (event.type === "clinical_event" && event.label) return resolveIntraopEventLabel(event.label, language)
  const ref = intraopItemRef(event)
  const domain = ref ? SUBJECT_DOMAIN[ref.kind] : undefined
  const subject = item.subject
    ? domain ? clinicalDisplayLabel(domain, item.subject, language, { label: item.subject }) : item.subject
    : null
  const what = clinicalDisplayLabel("eventType", EVENT_TERM[event.type] ?? event.type, language, { label: event.type })
  const value = event.rate != null
    ? ` ${event.rate} ${event.unit ?? ""}`.trimEnd()
    : event.type === "gas_change" && event.fgf != null ? ` FGF ${event.fgf} · FiO₂ ${event.fio2 ?? ""}%` : ""
  return [subject, `${what}${value}`].filter(Boolean).join(" · ")
}

/**
 * A suggestion line in the screen's language (10.2.0): "Hypotension: treat
 * now?", "Adenosine 12 mg: log supraventricular arrhythmia?", the readings,
 * labs, reminders and follow-ups in their own words.
 */
function suggestionText(line: SuggestionLine, language: ClinicalLocale): string {
  const bg = language === "bg"
  const complication = (label: string) => clinicalDisplayLabel("complication", label, language, { label })
  const item = line.item
  switch (item.type) {
    case "card": {
      const name = complication(item.complication.label ?? "")
      return item.card.kind === "checklist"
        ? (bg ? `${name}: следващи стъпки` : `${name}: next steps`)
        : (bg ? `${name}: лечение сега?` : `${name}: treat now?`)
    }
    case "reverse": {
      const trigger = item.question.trigger
      const what = trigger.type === "defibrillation"
        ? `${bg ? (trigger.synchronized ? "Кардиоверсия" : "Дефибрилация") : (trigger.synchronized ? "Cardioversion" : "Defibrillation")}${trigger.energyJ != null ? ` ${trigger.energyJ} J` : ""}`
        : trigger.id === "blood-loss"
          ? (bg ? "Кръвозагуба" : "Blood loss")
          : `${trigger.name ? clinicalDisplayLabel(trigger.type === "fluid_start" ? "option:INTRAOP_FLUID" : "option:INTRAOP_DRUG", trigger.name, language, { label: trigger.name }) : ""} ${trigger.dose ?? trigger.volume ?? ""} ${trigger.unit ?? (trigger.volume ? "mL" : "")}`.replace(/\s+/g, " ").trim()
      const choices = item.question.choices.map(complication)
      if (choices.length === 1) return bg ? `${what}: ${choices[0]}?` : `${what}: log ${choices[0]!.toLowerCase()}?`
      return bg ? `${what}: кое да се запише? ${choices.join(" / ")}` : `${what}: log which? ${choices.join(" / ")}`
    }
    case "reading": return readingQuestionText(item.question, language)
    case "lab": return labQuestionText(item.question, language)
    case "reminder": return item.reminder.kind === "ponv" ? ponvReminderText(item.reminder, language) : glucoseReminderText(language)
    case "timer": return timerText(item.timer, language)
    case "context": return contextLinkText(item.link, language)
  }
}

/** A change the server refused for good, as the autosave manager lists it. */
export type IntraopRefusedChange = {
  eventId: string
  status: number
  /** When it was refused. */
  at: string
  change?: "add" | "edit" | "delete"
  event?: Record<string, unknown>
}

const REFUSED_CHANGE: Record<"edit" | "delete", Record<ClinicalLocale, string>> = {
  edit: { en: "edit", bg: "промяна" },
  delete: { en: "deletion", bg: "изтриване" },
}

const REFUSED_REASON: Record<number, Record<ClinicalLocale, string>> = {
  400: { en: "it breaks the timeline rules", bg: "нарушава правилата на времевата линия" },
  403: { en: "not permitted for this account", bg: "не е разрешено за този профил" },
  404: { en: "the entry no longer exists", bg: "записът вече не съществува" },
  412: { en: "a later change was made on another screen and stands", bg: "по-късна промяна е направена на друг екран и остава в сила" },
}

/**
 * How each app lists a refused change (9.13.0): the time to show -- the
 * entry's own charted time when known, else when it was refused -- and one
 * line saying what it was and why, in the screen's language. One function, so
 * the PWA and the web app say the same thing. `log` is the saved log, which
 * still holds an entry whose edit or deletion was refused, and names the drug
 * a stop belongs to.
 */
export function intraopRefusedEntry(
  item: IntraopRefusedChange,
  locale: string,
  log: LogEvent[] = [],
): { at: string; text: string } {
  const language: ClinicalLocale = locale === "bg" ? "bg" : "en"
  const saved = log.find(event => event.id === item.eventId)
  const event = (item.event as LogEvent | undefined) ?? saved
  const subject = event ? subjects(saved ? log : [...log, event])(event) : undefined
  const what = event
    ? intraopAttentionText({ key: item.eventId, kind: "after_end", event, ...(subject ? { subject } : {}), actions: [] }, language)
    : language === "bg" ? "Запис" : "An entry"
  const change = item.change && item.change !== "add" ? ` (${REFUSED_CHANGE[item.change][language]})` : ""
  const reason = (REFUSED_REASON[item.status] ?? { en: "refused by the server", bg: "отказано от сървъра" })[language]
  return {
    at: typeof event?.ts === "string" ? event.ts : item.at,
    text: `${what}${change} — ${reason}`,
  }
}
