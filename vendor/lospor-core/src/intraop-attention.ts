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

export type IntraopAttentionKind = "unconfirmed_stop" | "after_end"

export type IntraopAttentionAction = "stopped" | "still_running" | "happened" | "did_not_happen"

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
}

export type IntraopAttentionContext = {
  /** The reading time (server-corrected "now"). */
  now: Date | string | number
  /** The case end, once ended. */
  endedAt?: Date | string | number | null
}

const STOP_ACTIONS = ["stopped", "still_running"] as const
const AFTER_END_ACTIONS = ["happened", "did_not_happen"] as const

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
  return items
    .map(item => {
      const subject = subjectOf(item.event)
      return subject ? { ...item, subject } : item
    })
    .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
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
): IntraopEventOps {
  const none: IntraopEventOps = { add: [], update: [], remove: [] }
  const item = intraopAttentionItems(log, context).find(candidate => candidate.key === key)
  if (!item || !item.actions.includes(action)) return none
  const recordedAt = new Date(context.now).toISOString()
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
