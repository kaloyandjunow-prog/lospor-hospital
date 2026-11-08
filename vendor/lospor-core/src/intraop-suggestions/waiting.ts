import { automationEnabled, automationGroupEnabled, type IntraopAutomationSettings, type UserAutomationSwitches } from "../intraop-automation"
import type { IntraopEventOps } from "../intraop-timetable-edit"
import type { LabResult } from "../labs"
import type { LogEvent } from "../intraop-types"
import { cardAutomationId, labAutomationId, readingAutomationId, REMINDER_IDS, reverseAutomationId, timerAutomationId } from "./automations"
import { resolveCard, type ResolvedCard } from "./cards"
import { suggestionCardFor } from "./catalogue"
import type { SuggestionPatient, SuggestionPreop } from "./context"
import { labAnswerOps, labQuestions, type LabQuestion } from "./labs"
import { readingAnswerOps, readingQuestions, type ReadingQuestion } from "./readings"
import { glucoseReminder, ponvReminder, reminderDismissOps, type GlucoseReminder, type PonvReminder } from "./reminders"
import { reverseAnswerOps, reverseQuestions, type ReverseQuestion } from "./reverse"
import { dueTimers, timerDismissOps, type TimerItem } from "./timers"
import { contextLinkDismissOps, contextLinkSuggestions, type ContextLinkItem } from "./context-links"

/**
 * Everything the suggestions (10.2.0) have waiting, as lines for the one
 * "Waiting for your answer" list, each gated by its group: on in Status and
 * not turned off by this clinician. The screen that holds the case builds the
 * context; a read-only screen passes none and asks nothing.
 */

export type SuggestionContext = {
  settings: IntraopAutomationSettings
  user?: UserAutomationSwitches | null
  patient: SuggestionPatient
  preop: SuggestionPreop
  /** TOF monitoring ticked on the intraop form. */
  tofMonitor: boolean
  /** The clinician's setting: keep logging while readings stay out of range. */
  keepLogging: boolean
  labs: readonly LabResult[]
  bloodLossMl?: number | null
  startedAt?: string | null
  endedAt?: string | null
  /** Exact techniques and sides currently on the intraoperative record. */
  techniques?: readonly string[]
  techniqueSides?: Record<string, "LEFT" | "RIGHT" | "BOTH">
  airwayDevices?: readonly string[]
  airwayDeviceEntries?: readonly Record<string, unknown>[]
  presentsIntubated?: boolean
  timeZone?: string | null
  now: Date | string | number
}

export type SuggestionItem =
  | { type: "card"; card: ResolvedCard; complication: LogEvent }
  | { type: "reverse"; question: ReverseQuestion }
  | { type: "reading"; question: ReadingQuestion }
  | { type: "lab"; question: LabQuestion }
  | { type: "reminder"; reminder: PonvReminder | GlucoseReminder }
  | { type: "timer"; timer: TimerItem }
  | { type: "context"; link: ContextLinkItem }

export type SuggestionLine = { key: string; ts: string; item: SuggestionItem }

const ms = (value: string) => Date.parse(value)

const answeredCard = (log: LogEvent[], complication: LogEvent) =>
  log.some(event => event.type === "prompt_answer" && event.answerFor === complication.id && (event.answerKind === "card" || event.answer === "done"))

/**
 * The cards still waiting: a complication with a card, nothing from it given
 * yet (a checklist waits until Done or dismissed, whatever was given), and no
 * Not now or Done recorded.
 */
export function waitingCards(log: LogEvent[], context: SuggestionContext): { card: ResolvedCard; complication: LogEvent }[] {
  if (!automationGroupEnabled(context.settings, "treatmentSuggestions", context.user)) return []
  const cards: { card: ResolvedCard; complication: LogEvent }[] = []
  for (const complication of log.filter(event => event.type === "complication" && event.label)) {
    const def = suggestionCardFor(complication.label)
    if (!def || answeredCard(log, complication)) continue
    if (!automationEnabled(context.settings, "treatmentSuggestions", cardAutomationId(def.complications[0]!), context.user)) continue
    const card = resolveCard(def, { log, patient: context.patient, preop: context.preop, complication, tofMonitor: context.tofMonitor, now: context.now })
    if (card.rows.length === 0) continue
    if (def.kind === "card" && card.rows.some(row => row.used)) continue
    cards.push({ card, complication })
  }
  return cards
}

/** Every line waiting now, oldest first. */
export function suggestionLines(log: LogEvent[], context: SuggestionContext | null | undefined): SuggestionLine[] {
  if (!context) return []
  const on = (group: Parameters<typeof automationGroupEnabled>[1]) => automationGroupEnabled(context.settings, group, context.user)
  const line = (group: Parameters<typeof automationGroupEnabled>[1], id: string) => automationEnabled(context.settings, group, id, context.user)
  const lines: SuggestionLine[] = []
  for (const { card, complication } of waitingCards(log, context)) {
    lines.push({ key: `card:${complication.id}`, ts: complication.ts, item: { type: "card", card, complication } })
  }
  if (on("reverseQuestions")) {
    for (const question of reverseQuestions(log, { patient: context.patient, bloodLossMl: context.bloodLossMl })) {
      if (!line("reverseQuestions", reverseAutomationId(question.rule))) continue
      lines.push({ key: question.key, ts: question.trigger.ts, item: { type: "reverse", question } })
    }
  }
  if (on("readingQuestions")) {
    for (const question of readingQuestions(log, { patient: context.patient, preop: context.preop, keepLogging: context.keepLogging, tofMonitor: context.tofMonitor })) {
      if (!line("readingQuestions", readingAutomationId(question.kind))) continue
      lines.push({ key: question.key, ts: question.reading.ts, item: { type: "reading", question } })
    }
  }
  if (on("labQuestions")) {
    for (const question of labQuestions(context.labs, log, context.patient, context.now)) {
      if (!line("labQuestions", labAutomationId(question.kind))) continue
      lines.push({ key: question.key, ts: question.ts, item: { type: "lab", question } })
    }
  }
  if (on("reminders")) {
    const ponv = ponvReminder(log, context.preop)
    if (ponv && line("reminders", REMINDER_IDS.ponv)) lines.push({ key: ponv.key, ts: ponv.trigger.ts, item: { type: "reminder", reminder: ponv } })
    const glucose = glucoseReminder(context.preop, context.labs, log, context.startedAt, context.now)
    if (glucose && line("reminders", REMINDER_IDS.glucose)) lines.push({ key: glucose.key, ts: glucose.dueAt, item: { type: "reminder", reminder: glucose } })
    for (const link of contextLinkSuggestions(log, {
      settings: context.settings,
      user: context.user,
      techniques: context.techniques ?? [],
      techniqueSides: context.techniqueSides,
      airwayDevices: context.airwayDevices,
      airwayDeviceEntries: context.airwayDeviceEntries,
      presentsIntubated: context.presentsIntubated,
      startedAt: context.startedAt ?? null,
      timeZone: context.timeZone,
      now: context.now,
    })) {
      lines.push({ key: link.key, ts: link.source.ts, item: { type: "context", link } })
    }
  }
  if (on("timers")) {
    for (const timer of dueTimers(log, { patient: context.patient, now: context.now, endedAt: context.endedAt, dantroleneVialsMg: context.settings.dantroleneVialsMg })) {
      if (!line("timers", timerAutomationId(timer.kind))) continue
      lines.push({ key: timer.key, ts: timer.dueAt, item: { type: "timer", timer } })
    }
  }
  return lines.sort((a, b) => ms(a.ts) - ms(b.ts))
}

/* ---------- answers ---------- */

const none: IntraopEventOps = { add: [], update: [], remove: [] }
const iso = (value: Date | string | number) => new Date(value).toISOString()

/** The tag an entry saved from a card row carries, for the export flag. */
export const cardSuggestionTag = (complication: string, rowId: string) => `card:${complication}:${rowId}`

/** Not now: the line leaves the list. Done: the card or checklist closes and its timers stop. */
export function cardCloseOps(complication: LogEvent, answer: "not_now" | "done", now: Date | string | number): IntraopEventOps {
  const ts = iso(now)
  return { ...none, add: [{ id: `pa-card-${answer}-${complication.id}`, ts, type: "prompt_answer", answerKind: "card", answerFor: complication.id, answer, recordedAt: ts }] }
}

/** "Is there a cause?" / "Is this X?": the event becomes the complication picked, and its card opens. */
export function cardRelabelOps(complication: LogEvent, label: string, rowId: string): IntraopEventOps {
  return { ...none, update: [{ ...complication, label, suggestion: cardSuggestionTag(complication.label ?? "", rowId) }] }
}

/** "Is there DIC too?" and the like: a second complication at the same time, with its own card. */
export function cardAlsoLogOps(complication: LogEvent, label: string, rowId: string, now: Date | string | number): IntraopEventOps {
  const ts = iso(now)
  return {
    ...none,
    add: [{ id: `sg-${rowId}-${complication.id}`, ts: complication.ts, type: "complication", label, color: "#ef4444", complicationSource: "suggestion",
      suggestion: cardSuggestionTag(complication.label ?? "", rowId), endTs: complication.ts, recordedAt: ts }],
  }
}

/** A question row answered yes: its hidden rows show (hyponatraemia's 3% saline), and it may log a complication. */
export function cardQuestionOps(complication: LogEvent, rowId: string, reveals: readonly string[], logs: string | undefined, now: Date | string | number): IntraopEventOps {
  const ts = iso(now)
  const add: LogEvent[] = reveals.map(reveal => ({ id: `pa-reveal-${reveal}-${complication.id}`, ts, type: "prompt_answer", answerKind: `card-reveal:${reveal}`, answerFor: complication.id, recordedAt: ts }))
  if (logs) {
    add.push({ id: `sg-${rowId}-${complication.id}`, ts: complication.ts, type: "complication", label: logs, color: "#ef4444", complicationSource: "suggestion",
      suggestion: cardSuggestionTag(complication.label ?? "", rowId), endTs: complication.ts, recordedAt: ts })
  }
  return { ...none, add }
}

/** "Resolved?": the episode ends now or at the time typed. */
export function cardResolveOps(complication: LogEvent, endTs: Date | string | number): IntraopEventOps {
  const end = iso(endTs)
  if (ms(end) < ms(complication.ts)) return none
  return { ...none, update: [{ ...complication, endTs: end }] }
}

/** An event row (CPR started, ROSC, Positioned, Tourniquet off …), at the time given. */
export function cardEventOps(complication: LogEvent, label: string, rowId: string, at: Date | string | number, now: Date | string | number, extra: Partial<LogEvent> = {}): IntraopEventOps {
  return {
    ...none,
    add: [{ id: `sg-event-${rowId}-${complication.id}-${ms(iso(at))}`, ts: iso(at), type: "clinical_event", label,
      suggestion: cardSuggestionTag(complication.label ?? "", rowId), recordedAt: iso(now), ...extra }],
  }
}

/** The "Not now" for any non-card line. */
export function suggestionDismissOps(line: SuggestionLine, context: Pick<SuggestionContext, "keepLogging">, now: Date | string | number): IntraopEventOps {
  const item = line.item
  switch (item.type) {
    case "card": return cardCloseOps(item.complication, "not_now", now)
    case "reverse": return reverseAnswerOps(item.question, "not_now", now)
    case "reading": return readingAnswerOps(item.question, "not_now", context, now)
    case "lab": return labAnswerOps(item.question, "not_now", now)
    case "reminder": return reminderDismissOps(item.reminder, now)
    case "timer": return timerDismissOps(item.timer, now)
    case "context": return contextLinkDismissOps(item.link, now)
  }
}

/** A yes to a question line: the complication logged (a pick where the question offers several). */
export function suggestionLogOps(line: SuggestionLine, choice: string | undefined, context: Pick<SuggestionContext, "keepLogging">, now: Date | string | number): IntraopEventOps {
  const item = line.item
  switch (item.type) {
    case "reverse": {
      const pick = choice ?? (item.question.choices.length === 1 ? item.question.choices[0] : undefined)
      return pick ? reverseAnswerOps(item.question, { log: pick }, now) : none
    }
    case "reading": return item.question.kind === "nearZero" ? (choice ? readingAnswerOps(item.question, { log: choice }, context, now) : none) : readingAnswerOps(item.question, "log", context, now)
    case "lab": return labAnswerOps(item.question, "log", now)
    default: return none
  }
}
