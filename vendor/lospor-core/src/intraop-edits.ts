import { INTRAOP_COLUMN_MS, sortIntraopEvents } from "./intraop-engine"
import {
  intraopCascadeDeleteIds,
  intraopEndCaseStopEvent,
  intraopItemRef,
  intraopRunningItemsAt,
  newIntraopTimelineIssues,
  stampEnteredEvents,
  type IntraopItemKind,
  type IntraopRunningItem,
  type IntraopTimelineIssue,
} from "./intraop-commands"
import type { LogEvent } from "./intraop-types"
import type { IntraopEventOps } from "./intraop-timetable-edit"

/** Whether two events say the same, whatever order their keys were written in (a re-parsed event must not look edited). */
export function sameEventJson(a: unknown, b: unknown): boolean {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).map(([key, item]) => [key, stable(item)]))
      : value
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b))
}

/** The event operations that turn one log into another: what the save path sends. */
export function intraopOpsBetween(previous: LogEvent[], next: LogEvent[]): IntraopEventOps {
  const before = new Map(previous.map(event => [event.id, event]))
  const after = new Map(next.map(event => [event.id, event]))
  const ops: IntraopEventOps = { add: [], update: [], remove: [] }
  for (const [id, event] of after) {
    const was = before.get(id)
    if (!was) ops.add.push(event)
    else if (!sameEventJson(was, event)) ops.update.push(event)
  }
  for (const id of before.keys()) if (!after.has(id)) ops.remove.push(id)
  return ops
}

/**
 * Edit, Move and Delete on the intraoperative chart (10.8.0), one set of rules
 * for the PWA, the web app and the event log. Every function is pure: it takes
 * the log and returns the log after the edit, or the reason it is refused.
 *
 * - Move keeps the same event (same id): its save mark, audit trail, undo and
 *   offline queue all follow it.
 * - Something that already happened is never moved into the future.
 * - A running item's start never moves past now (it would become planned).
 * - A tourniquet that came off cannot come off before it went on.
 * - Delete removes what is in the cell: a start takes its whole run, a change
 *   or a stop goes alone. "Delete whole" removes the run from any of its cells.
 */

export type IntraopEditContext = {
  now: Date | string | number
  startedAt?: Date | string | number | null
  endedAt?: Date | string | number | null
}

export type IntraopEditRefusal =
  | "NOT_FOUND"
  | "NOT_MOVABLE"
  | "AFTER_CASE_END"
  | "BEFORE_CASE_START"
  | "DONE_INTO_FUTURE"
  | "START_AFTER_NOW"
  | "NO_END"
  | "PAIR_ORDER"
  | "TIMELINE"

export type IntraopEditResult =
  | { ok: true; events: LogEvent[]; changedIds: string[] }
  | { ok: false; refusal: IntraopEditRefusal; issues?: IntraopTimelineIssue[] }

function ms(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : typeof value === "number" ? value : new Date(value).getTime()
}

export const TOURNIQUET_ON = "Tourniquet on"
export const TOURNIQUET_OFF = "Tourniquet off"

const AIRWAY_LABELS = new Set(["Intubated", "Reintubation", "LMA in", "DLT placed", "Airway exchange", "Extubated", "LMA out"])
const VASCULAR_LABELS = new Set(["IV line in", "Art line in", "CVC in", "PICC"])

/** The section an event was entered from, whose record it carries (airway and vascular). */
export function intraopLinkedSection(event: LogEvent): "airway" | "vascular" | null {
  if (event.type !== "clinical_event") return null
  const label = event.label ?? ""
  if (event.intraopPatch && "airwayEventDevice" in event.intraopPatch) return "airway"
  if (AIRWAY_LABELS.has(label) && (event.intraopPatch || event.sourceEventId)) return "airway"
  if (VASCULAR_LABELS.has(label) && (event.intraopPatch || event.sourceEventId)) return "vascular"
  return null
}

function isTourniquet(event: LogEvent | undefined, label: string): boolean {
  return !!event && event.type === "clinical_event" && event.label === label
}

/**
 * Tourniquet on/off as pairs, in time order: each "on" is matched with the
 * next "off" at the same site (or any site when either has none).
 */
export function intraopTourniquetPairs(events: LogEvent[]): Array<{ onId: string; offId: string | null }> {
  const ordered = sortIntraopEvents(events)
  const open: LogEvent[] = []
  const pairs: Array<{ onId: string; offId: string | null }> = []
  for (const event of ordered) {
    if (isTourniquet(event, TOURNIQUET_ON)) {
      open.push(event)
      pairs.push({ onId: event.id, offId: null })
    } else if (isTourniquet(event, TOURNIQUET_OFF)) {
      const index = open.findIndex(on => !on.site || !event.site || on.site === event.site)
      if (index < 0) continue
      const [on] = open.splice(index, 1)
      const pair = pairs.find(item => item.onId === on.id)
      if (pair) pair.offId = event.id
    }
  }
  return pairs
}

/** The other half of a tourniquet pair, or null. */
export function intraopTourniquetPartnerId(events: LogEvent[], eventId: string): string | null {
  for (const pair of intraopTourniquetPairs(events)) {
    if (pair.onId === eventId) return pair.offId
    if (pair.offId === eventId) return pair.onId
  }
  return null
}

/** Deleting a tourniquet "on" whose "off" is recorded asks: both, or only this one. */
export function intraopDeleteAsksAboutPair(events: LogEvent[], eventId: string): boolean {
  const event = events.find(item => item.id === eventId)
  return isTourniquet(event, TOURNIQUET_ON) && intraopTourniquetPartnerId(events, eventId) !== null
}

/** "Tourniquet off" entries with no "on" before them. */
function unmatchedOffs(events: LogEvent[]): Set<string> {
  const matched = new Set(intraopTourniquetPairs(events).map(pair => pair.offId).filter((id): id is string => !!id))
  return new Set(events.filter(event => isTourniquet(event, TOURNIQUET_OFF) && !matched.has(event.id)).map(event => event.id))
}

/** Tourniquets still on at an instant (no "off" yet). */
export function intraopOpenTourniquets(events: LogEvent[], instant: Date | string | number): LogEvent[] {
  const atMs = ms(instant)
  const byId = new Map(events.map(event => [event.id, event]))
  return intraopTourniquetPairs(events)
    .filter(pair => {
      const on = byId.get(pair.onId)
      if (!on || ms(on.ts) > atMs) return false
      const off = pair.offId ? byId.get(pair.offId) : undefined
      return !off || ms(off.ts) > atMs
    })
    .map(pair => byId.get(pair.onId)!)
}

/** The start of the run an event belongs to (itself when it is a start). */
export function intraopRunStartId(events: LogEvent[], eventId: string): string | null {
  const ordered = sortIntraopEvents(events)
  const index = ordered.findIndex(event => event.id === eventId)
  if (index < 0) return null
  const ref = intraopItemRef(ordered[index])
  if (!ref) return null
  if (ref.role === "start") return eventId
  for (let i = index - 1; i >= 0; i -= 1) {
    const other = intraopItemRef(ordered[i])
    if (other && other.kind === ref.kind && other.key === ref.key && other.role === "start") return ordered[i].id
  }
  return null
}

/** The events of one run: its start, changes and stop. */
export function intraopRunEventIds(events: LogEvent[], eventId: string): string[] {
  const startId = intraopRunStartId(events, eventId)
  return startId ? intraopCascadeDeleteIds(events, startId) : []
}

/** Delete as the menu means it: what is in that cell. */
export function intraopDeleteHere(events: LogEvent[], eventId: string, options: { withPair?: boolean } = {}): LogEvent[] {
  const ids = new Set(intraopCascadeDeleteIds(events, eventId))
  if (options.withPair) {
    const partner = intraopTourniquetPartnerId(events, eventId)
    if (partner) ids.add(partner)
  }
  return withLinkedSectionDelete(events, events.filter(event => !ids.has(event.id)), [...ids])
}

/** "Delete whole": the run, from any of its cells. */
export function intraopDeleteWhole(events: LogEvent[], eventId: string): LogEvent[] {
  const ids = new Set(intraopRunEventIds(events, eventId))
  if (ids.size === 0) ids.add(eventId)
  return events.filter(event => !ids.has(event.id))
}

function refuseOutsideCase(atMs: number, context: IntraopEditContext): IntraopEditRefusal | null {
  if (context.endedAt != null && atMs > ms(context.endedAt)) return "AFTER_CASE_END"
  if (context.startedAt != null && atMs < ms(context.startedAt)) return "BEFORE_CASE_START"
  return null
}

function finish(before: LogEvent[], after: LogEvent[], changedId: string, context: IntraopEditContext): IntraopEditResult {
  const before0 = unmatchedOffs(before)
  for (const id of unmatchedOffs(after)) {
    if (!before0.has(id)) return { ok: false, refusal: "PAIR_ORDER" }
  }
  const issues = newIntraopTimelineIssues(before, after, {
    now: context.now,
    startedAt: context.startedAt ?? undefined,
    endedAt: context.endedAt ?? undefined,
  }).filter(issue => issue.code !== "BEFORE_CASE_START" && issue.code !== "AFTER_CASE_END")
  if (issues.length > 0) return { ok: false, refusal: "TIMELINE", issues }
  return { ok: true, events: stampEnteredEvents(before, after, context.now), changedIds: [changedId] }
}

function retime(events: LogEvent[], eventId: string, ts: string): LogEvent[] {
  return events.map(event => event.id === eventId ? { ...event, ts } : event)
}

/**
 * Move a one-off entry (drug, event, complication, position, phase, shock) to
 * a new time. Vitals are edited or deleted, not moved; running items have
 * Fix start and Fix end instead.
 */
export function intraopMoveEvent(
  events: LogEvent[],
  eventId: string,
  to: Date | string | number,
  context: IntraopEditContext,
): IntraopEditResult {
  const event = events.find(item => item.id === eventId)
  if (!event) return { ok: false, refusal: "NOT_FOUND" }
  if (event.type === "vital" || intraopItemRef(event)) return { ok: false, refusal: "NOT_MOVABLE" }
  const toMs = ms(to)
  const outside = refuseOutsideCase(toMs, context)
  if (outside) return { ok: false, refusal: outside }
  const nowMs = ms(context.now)
  if (ms(event.ts) <= nowMs && toMs > nowMs) return { ok: false, refusal: "DONE_INTO_FUTURE" }
  const moved = retime(events, eventId, new Date(toMs).toISOString())
  return finish(events, withLinkedSectionMove(moved, eventId, new Date(toMs).toISOString()), eventId, context)
}

/**
 * Fix start / Fix end of a running item, from any of its cells. The end moves
 * a recorded stop; an item with no stop is stopped with Stop instead.
 */
export function intraopFixBoundary(
  events: LogEvent[],
  eventId: string,
  which: "start" | "end",
  to: Date | string | number,
  context: IntraopEditContext,
): IntraopEditResult {
  const runIds = intraopRunEventIds(events, eventId)
  if (runIds.length === 0) return { ok: false, refusal: "NOT_FOUND" }
  const run = sortIntraopEvents(events.filter(event => runIds.includes(event.id)))
  const start = run[0]
  const stop = run.find(event => intraopItemRef(event)?.role === "stop")
  const toMs = ms(to)
  const outside = refuseOutsideCase(toMs, context)
  if (outside) return { ok: false, refusal: outside }
  const nowMs = ms(context.now)
  if (which === "start") {
    const running = !stop || ms(stop.ts) > nowMs
    if (running && ms(start.ts) <= nowMs && toMs > nowMs) return { ok: false, refusal: "START_AFTER_NOW" }
    return finish(events, retime(events, start.id, new Date(toMs).toISOString()), start.id, context)
  }
  if (!stop) return { ok: false, refusal: "NO_END" }
  return finish(events, retime(events, stop.id, new Date(toMs).toISOString()), stop.id, context)
}

/** How far back a start must be charted before "still running?" is asked (2026-11-23: five minutes back is routine catching up). */
export const INTRAOP_STILL_RUNNING_MIN_AGE_MS = 30 * 60_000

/**
 * A start charted well back (at least half an hour, and in an earlier cell) is asked about at once: still running, or
 * stopped earlier? A start a few minutes back is the ordinary case of writing it down late, and is not asked.
 */
export function intraopAsksStillRunning(event: LogEvent, now: Date | string | number, chartStart: Date | string | number): boolean {
  const ref = intraopItemRef(event)
  if (!ref || ref.role !== "start") return false
  const column = (value: Date | string | number) => Math.floor((ms(value) - ms(chartStart)) / INTRAOP_COLUMN_MS)
  // Lateness is judged when the start was written (recordedAt), not by the clock now: a start entered live is never asked
  // about thirty minutes later. An event without recordedAt (an older one) is judged by the clock.
  const enteredMs = event.recordedAt ? ms(event.recordedAt as string) : ms(now)
  return column(event.ts) < column(enteredMs) && enteredMs - ms(event.ts) >= INTRAOP_STILL_RUNNING_MIN_AGE_MS
}

/** Items stopped before an instant and not started again by it: the PWA cell's "Stopped: ..." line. */
export function intraopStoppedItemsAt(
  events: LogEvent[],
  instant: Date | string | number,
): Array<{ kind: IntraopItemKind; key: string; stopEvent: LogEvent }> {
  const atMs = ms(instant)
  const last = new Map<string, { kind: IntraopItemKind; key: string; stopEvent: LogEvent | null }>()
  for (const event of sortIntraopEvents(events)) {
    if (ms(event.ts) > atMs) break
    const ref = intraopItemRef(event)
    if (!ref) continue
    const id = `${ref.kind}:${ref.key}`
    if (ref.role === "start") last.set(id, { kind: ref.kind, key: ref.key, stopEvent: null })
    else if (ref.role === "stop") last.set(id, { kind: ref.kind, key: ref.key, stopEvent: event })
  }
  return [...last.values()]
    .filter((item): item is { kind: IntraopItemKind; key: string; stopEvent: LogEvent } => item.stopEvent !== null)
}

export type IntraopEndCaseQuestion =
  /** A start planned after the end: did it start at all, and when? */
  | { kind: "started_at_all"; eventId: string }
  /** A one-off planned after the end: was it done? */
  | { kind: "happened"; eventId: string }
  /** Running at the end: stopped here, or goes on after the case. */
  | { kind: "continues_after_end"; item: IntraopRunningItem }
  /** A tourniquet still on: mandatory. */
  | { kind: "tourniquet_open"; eventId: string }

/** Everything the End case sheet asks, one line each. */
export function intraopEndCaseQuestions(events: LogEvent[], endedAt: Date | string | number): IntraopEndCaseQuestion[] {
  const endMs = ms(endedAt)
  const questions: IntraopEndCaseQuestion[] = []
  const runningAfterIds = new Set<string>()
  for (const event of sortIntraopEvents(events)) {
    if (ms(event.ts) <= endMs) continue
    const ref = intraopItemRef(event)
    if (ref?.role === "start") {
      questions.push({ kind: "started_at_all", eventId: event.id })
      for (const id of intraopCascadeDeleteIds(events, event.id)) runningAfterIds.add(id)
    } else if (!ref) {
      if (event.type !== "prompt_answer") questions.push({ kind: "happened", eventId: event.id })
    }
  }
  for (const item of intraopRunningItemsAt(events, endMs)) questions.push({ kind: "continues_after_end", item })
  for (const on of intraopOpenTourniquets(events, endMs)) questions.push({ kind: "tourniquet_open", eventId: on.id })
  return questions
}

/**
 * The answer to "did it start at all?" for a start planned after the end: no
 * removes the run; yes moves its start to when it did start (within the case)
 * and drops its changes and stop that fell after the end. The item is then
 * running at the end and is stopped there like everything else.
 */
export function intraopResolveStartedAtAll(
  events: LogEvent[],
  startId: string,
  startedAt: Date | string | number | null,
  context: IntraopEditContext & { endedAt: Date | string | number },
): IntraopEditResult {
  const runIds = intraopCascadeDeleteIds(events, startId)
  if (startedAt == null) return { ok: true, events: events.filter(event => !runIds.includes(event.id)), changedIds: runIds }
  const toMs = ms(startedAt)
  const outside = refuseOutsideCase(toMs, context)
  if (outside) return { ok: false, refusal: outside }
  const endMs = ms(context.endedAt)
  const dropped = new Set(runIds.filter(id => id !== startId && ms(events.find(event => event.id === id)!.ts) > endMs))
  const after = retime(events.filter(event => !dropped.has(event.id)), startId, new Date(toMs).toISOString())
  // The same timeline check as every other edit: a start moved after a change that stays is refused, not saved out of order.
  const checked = finish(events, after, startId, context)
  return checked.ok ? { ...checked, changedIds: [startId, ...dropped] } : checked
}

/**
 * The start to ask "still running?" about (10.8.0, rule 3): one entered on
 * this screen since it opened, charted in a cell before now's, and still
 * running. Shared so the web and the PWA ask in exactly the same cases.
 */
export function intraopStillRunningQuestion(
  events: LogEvent[],
  input: {
    knownIds: ReadonlySet<string>; answeredIds: ReadonlySet<string>; now: Date | string | number; chartStart: Date | string | number
    /** Only entries made since then (the screen's opening): a log that loads late is not new. */
    enteredSince?: Date | string | number
  },
): LogEvent | null {
  const running = new Set(intraopRunningItemsAt(events, input.now).map(item => `${item.kind}:${item.key}`))
  const sorted = sortIntraopEvents(events)
  // A start that anything later of the same item follows is not in doubt: a stop ends it, and a later start or
  // change shows it was still running then (it began earlier than charted).
  const continuedLater = (event: LogEvent) => {
    const own = intraopItemRef(event)
    return !!own && sorted.slice(sorted.indexOf(event) + 1).some(later => { const ref = intraopItemRef(later); return !!ref && ref.kind === own.kind && ref.key === own.key })
  }
  return sorted.find(event => {
    if (input.knownIds.has(event.id) || input.answeredIds.has(event.id)) return false
    if (continuedLater(event)) return false
    if (input.enteredSince != null && (!event.recordedAt || ms(event.recordedAt) < ms(input.enteredSince))) return false
    const ref = intraopItemRef(event)
    return !!ref && ref.role === "start" && running.has(`${ref.kind}:${ref.key}`) && intraopAsksStillRunning(event, input.now, input.chartStart)
  }) ?? null
}

/** The stop for a running item, at an instant: the answer "it stopped at ..." (10.8.0). */
export function intraopStopAt(events: LogEvent[], startId: string, instant: Date | string | number, context: IntraopEditContext): IntraopEditResult {
  const start = events.find(event => event.id === startId)
  const ref = start ? intraopItemRef(start) : null
  if (!start || !ref) return { ok: false, refusal: "NOT_FOUND" }
  const toMs = ms(instant)
  if (toMs < ms(start.ts)) return { ok: false, refusal: "PAIR_ORDER" }
  const outside = refuseOutsideCase(toMs, context)
  if (outside) return { ok: false, refusal: outside }
  const item = intraopRunningItemsAt(events, ms(context.now)).find(candidate => candidate.kind === ref.kind && candidate.key === ref.key)
  if (!item) return { ok: false, refusal: "NOT_FOUND" }
  const { endCaseStop: _endCaseStop, ...stop } = intraopEndCaseStopEvent(item, new Date(toMs).toISOString())
  const id = `stop-${startId}-${toMs}`
  const next = [...events, { ...stop, id } as LogEvent]
  return finish(events, stampEnteredEvents(events, next, context.now), id, context)
}
// ── Airway and vascular entries (10.8.0, rule 9) ───────────────────────────
// An event entered from the Airway or Vascular section carries that section's
// list in its patch, and each device or line points back at its event. Moving
// the event moves the time in the section; deleting it takes the device or
// line off the section.

const SECTION_FIELD = { airway: "airwayDeviceEntries", vascular: "vascularAccesses" } as const
type SectionEntry = { sourceEventId?: string; insertedAt?: string | null; [key: string]: unknown }

/** The section's list as the log last wrote it. */
function latestSectionList(events: LogEvent[], field: string): SectionEntry[] | null {
  const written = sortIntraopEvents(events).filter(event => Array.isArray((event.intraopPatch as Record<string, unknown> | undefined)?.[field]))
  const last = written[written.length - 1]
  return last ? ((last.intraopPatch as Record<string, unknown>)[field] as SectionEntry[]) : null
}

function sectionOf(event: LogEvent | undefined): (typeof SECTION_FIELD)[keyof typeof SECTION_FIELD] | null {
  const section = event ? intraopLinkedSection(event) : null
  return section ? SECTION_FIELD[section] : null
}

function withLinkedSectionDelete(before: LogEvent[], after: LogEvent[], removedIds: string[]): LogEvent[] {
  let next = after
  for (const id of removedIds) {
    const field = sectionOf(before.find(event => event.id === id))
    if (!field) continue
    const list = latestSectionList(before, field)
    const kept = list?.some(entry => entry.sourceEventId === id) ? list.filter(entry => entry.sourceEventId !== id) : null
    const removed = before.find(event => event.id === id)!
    // A note at the deleted entry's time carries the removal (deleting an event cannot carry a patch).
    // The server drops exactly the entries pointing at this event, whatever list it holds.
    next = [...next, { id: `section-${id}`, ts: removed.ts, type: "prompt_answer", answerFor: id, answerKind: "section", answer: "done", intraopPatch: { ...(kept ? { [field]: kept } : {}), removedSourceEventIds: [id] } } as LogEvent]
  }
  return next
}

function withLinkedSectionMove(events: LogEvent[], eventId: string, ts: string): LogEvent[] {
  const event = events.find(item => item.id === eventId)
  const field = sectionOf(event)
  if (!event || !field) return events
  const list = latestSectionList(events, field)
  if (!list || !list.some(entry => entry.sourceEventId === eventId)) return events
  const moved = list.map(entry => entry.sourceEventId === eventId ? { ...entry, insertedAt: ts } : entry)
  return events.map(item => item.id === eventId
    ? { ...item, intraopPatch: { ...(item.intraopPatch as Record<string, unknown> | undefined), [field]: moved } } as LogEvent
    : item)
}
/**
 * A dose change on a running item, made in a cell (10.8.0, rule 4): the one rule
 * for both apps and every kind -- infusion rate, fluid rate, agent percent, gas
 * and jet settings.
 * - In the cell the item started in, it replaces the start's own dose: the old
 *   dose is gone, later changes stay.
 * - In a cell that already has a change, it replaces that change.
 * - Anywhere else: null, and the caller writes a new change at the cell's time.
 * A change stamped before the start's own minute would be ignored by the chart
 * (or, for an agent, would turn the start into a change), so the start cell is
 * always an edit of the start, never a change.
 */
const DOSE_KINDS = {
  infusion: { start: "infusion_start", change: "infusion_rate", stop: "infusion_stop", own: (event: LogEvent, key: string) => event.infId === key },
  fluid: { start: "fluid_start", change: "fluid_rate", stop: "fluid_end", own: (event: LogEvent, key: string) => event.fluidId === key },
  agent: { start: "agent_start", change: "agent_start", stop: "agent_stop", own: (event: LogEvent, key: string) => event.name === key || (event.type === "agent_stop" && event.name == null) },
  gas: { start: "gas_start", change: "gas_change", stop: "gas_stop", own: () => true },
  jet: { start: "jet_start", change: "jet_change", stop: "jet_stop", own: () => true },
} as const

export type IntraopDoseKind = keyof typeof DOSE_KINDS

export function intraopApplyDoseChange(
  events: LogEvent[],
  input: { kind: IntraopDoseKind; key: string; at: Date | string | number; chartStart: Date | string | number; fields: Partial<LogEvent> },
): LogEvent[] | null {
  const spec = DOSE_KINDS[input.kind]
  const column = (value: Date | string | number) => Math.floor((ms(value) - ms(input.chartStart)) / INTRAOP_COLUMN_MS)
  const target = column(input.at)
  // The item's runs, in time order: a start, its changes, and its stop if any.
  type Run = { start: LogEvent; changes: LogEvent[]; stop: LogEvent | null }
  const runs: Run[] = []
  let open: Run | null = null
  for (const event of sortIntraopEvents(events)) {
    if (!spec.own(event, input.key)) continue
    if (event.type === spec.start && (!open || input.kind !== "agent")) {
      open = { start: event, changes: [], stop: null }
      runs.push(open)
    } else if (open && event.type === spec.change) {
      open.changes.push(event)
    } else if (open && event.type === spec.stop) {
      open.stop = event
      open = null
    }
  }
  const run = [...runs].reverse().find(item => column(item.start.ts) <= target && (!item.stop || column(item.stop.ts) >= target))
  if (!run) return null
  const fields = Object.fromEntries(Object.entries(input.fields).filter(([, value]) => value !== undefined))
  const edited = column(run.start.ts) === target ? run.start : run.changes.find(change => column(change.ts) === target)
  return edited ? events.map(event => event.id === edited.id ? { ...event, ...fields } : event) : null
}

/** The infusion's case of the rule above, by its id. */
export function intraopApplyRateChange(
  events: LogEvent[],
  input: { infId: string; at: Date | string | number; chartStart: Date | string | number; fields: Pick<LogEvent, "rate" | "unit"> & Partial<Pick<LogEvent, "concentration" | "volumeRateMlPerHour" | "calculationWeightKg">> },
): LogEvent[] | null {
  return intraopApplyDoseChange(events, { kind: "infusion", key: input.infId, at: input.at, chartStart: input.chartStart, fields: input.fields })
}