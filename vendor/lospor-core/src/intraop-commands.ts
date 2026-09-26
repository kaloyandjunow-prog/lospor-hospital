import { INTRAOP_COLUMN_MS, sortIntraopEvents } from "./intraop-engine"
import type { LogEvent } from "./intraop-types"

/**
 * The intraoperative timeline rules, shared by the PWA, the web app and the
 * API so that one chart behaves the same everywhere (1.4.9).
 *
 * - A stamp is the exact minute when entered in the "now" row, otherwise the
 *   start of the row it was entered in.
 * - Nothing else moves when one item changes; deleting a start takes its
 *   changes and stop with it.
 * - Refused: a stop before its start, a change or stop of something that is
 *   not running, a stop placed before a later change of the same item, and a
 *   vital in the future. Restarting a stopped item is allowed. Other entries
 *   may be drafted for a future time (planned items).
 *
 * Validation reports only issues an edit introduces, so a legacy record that
 * already breaks a rule can still be edited.
 */

export type IntraopItemKind = "infusion" | "fluid" | "agent" | "gas"

export type IntraopTimelineIssueCode =
  | "STOP_BEFORE_START"
  | "NOT_RUNNING"
  | "STOP_BEFORE_LATER_CHANGE"
  | "ALREADY_RUNNING"
  | "FUTURE_VITAL"
  | "BEFORE_CASE_START"
  | "AFTER_CASE_END"

export type IntraopTimelineIssue = {
  code: IntraopTimelineIssueCode
  /** The entry that breaks the rule. */
  eventId: string
  /** The entry it conflicts with, when there is one. */
  relatedEventId?: string
}

export type IntraopTimelineContext = {
  /** Vitals may not be later than this. Omit to skip the future-vital rule. */
  now?: Date | string | number
  /** Case start: nothing may be earlier. */
  startedAt?: Date | string | number | null
  /** Case end: nothing may be later. */
  endedAt?: Date | string | number | null
}

type ItemRole = "start" | "change" | "stop"

type ItemRef = { kind: IntraopItemKind; key: string; role: ItemRole }

function ms(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : typeof value === "number" ? value : new Date(value).getTime()
}

/**
 * Which running item an event belongs to, and what it does to it. Events of
 * other kinds (vitals, drugs, clinical events, positions, phases) return null.
 */
export function intraopItemRef(event: LogEvent): ItemRef | null {
  switch (event.type) {
    case "infusion_start": return event.infId ? { kind: "infusion", key: event.infId, role: "start" } : null
    case "infusion_rate": return event.infId ? { kind: "infusion", key: event.infId, role: "change" } : null
    case "infusion_stop": return event.infId ? { kind: "infusion", key: event.infId, role: "stop" } : null
    case "fluid_start": return event.fluidId ? { kind: "fluid", key: event.fluidId, role: "start" } : null
    case "fluid_rate": return event.fluidId ? { kind: "fluid", key: event.fluidId, role: "change" } : null
    case "fluid_end": return event.fluidId ? { kind: "fluid", key: event.fluidId, role: "stop" } : null
    case "agent_start": return event.name ? { kind: "agent", key: event.name, role: "start" } : null
    case "agent_stop": return { kind: "agent", key: event.name ?? "", role: "stop" }
    case "gas_start": return { kind: "gas", key: "gas", role: "start" }
    case "gas_change": return { kind: "gas", key: "gas", role: "change" }
    case "gas_stop": return { kind: "gas", key: "gas", role: "stop" }
    default: return null
  }
}

function itemId(kind: IntraopItemKind, key: string): string {
  return `${kind}:${key}`
}

type RunState = { startId: string; stopId?: string }

/**
 * Replays the log in time order and reports every broken rule. Pure: the same
 * log always gives the same issues.
 */
export function validateIntraopTimeline(
  events: LogEvent[],
  context: IntraopTimelineContext = {},
): IntraopTimelineIssue[] {
  const issues: IntraopTimelineIssue[] = []
  const ordered = sortIntraopEvents(events)
  const running = new Map<string, RunState>()
  const lastStop = new Map<string, string>()
  const everStarted = new Set<string>()
  const laterStarts = new Map<string, number>()
  for (const event of ordered) {
    const ref = intraopItemRef(event)
    if (ref?.role === "start") {
      const id = itemId(ref.kind, ref.key)
      laterStarts.set(id, (laterStarts.get(id) ?? 0) + 1)
    }
  }

  const nowMs = context.now == null ? null : ms(context.now)
  const startMs = context.startedAt == null ? null : ms(context.startedAt)
  const endMs = context.endedAt == null ? null : ms(context.endedAt)

  for (const event of ordered) {
    const eventMs = ms(event.ts)
    if (event.type === "vital" && nowMs != null && eventMs > nowMs) {
      issues.push({ code: "FUTURE_VITAL", eventId: event.id })
    }
    if (startMs != null && eventMs < startMs) issues.push({ code: "BEFORE_CASE_START", eventId: event.id })
    if (endMs != null && eventMs > endMs) issues.push({ code: "AFTER_CASE_END", eventId: event.id })

    const ref = intraopItemRef(event)
    if (!ref) continue
    const id = itemId(ref.kind, ref.key)

    if (ref.role === "start") {
      laterStarts.set(id, (laterStarts.get(id) ?? 1) - 1)
      if (ref.kind === "agent" && event.agentMode !== "concurrent") {
        // Before 1.4.9 starting another agent ended the running one silently.
        for (const other of [...running.keys()]) {
          if (other.startsWith("agent:") && other !== id) {
            lastStop.set(other, event.id)
            running.delete(other)
          }
        }
      }
      if (ref.kind === "gas" && running.has(id)) {
        // A new gas start replaces the running settings: a restart, not an error.
        running.delete(id)
      }
      const current = running.get(id)
      if (current && ref.kind !== "agent") {
        issues.push({ code: "ALREADY_RUNNING", eventId: event.id, relatedEventId: current.startId })
        continue
      }
      if (!current) running.set(id, { startId: event.id })
      everStarted.add(id)
      lastStop.delete(id)
      continue
    }

    if (ref.kind === "agent" && ref.role === "stop" && !event.name && event.agentMode !== "concurrent") {
      // A legacy unnamed stop ended whichever agent was running.
      const agentsRunning = [...running.keys()].filter(key => key.startsWith("agent:"))
      if (agentsRunning.length === 0) issues.push({ code: "NOT_RUNNING", eventId: event.id })
      for (const key of agentsRunning) {
        running.delete(key)
        lastStop.set(key, event.id)
      }
      continue
    }

    const current = running.get(id)
    if (current) {
      if (ref.role === "stop") {
        running.delete(id)
        lastStop.set(id, event.id)
      }
      continue
    }

    const stoppedBy = lastStop.get(id)
    if (ref.role === "change" && stoppedBy) {
      issues.push({ code: "STOP_BEFORE_LATER_CHANGE", eventId: stoppedBy, relatedEventId: event.id })
    } else if (ref.role === "stop" && !everStarted.has(id) && (laterStarts.get(id) ?? 0) > 0) {
      issues.push({ code: "STOP_BEFORE_START", eventId: event.id })
    } else {
      issues.push({ code: "NOT_RUNNING", eventId: event.id })
    }
  }
  return issues
}

function issueKey(issue: IntraopTimelineIssue): string {
  return `${issue.code}:${issue.eventId}:${issue.relatedEventId ?? ""}`
}

/** Issues present after an edit that were not present before it. */
export function newIntraopTimelineIssues(
  before: LogEvent[],
  after: LogEvent[],
  context: IntraopTimelineContext = {},
): IntraopTimelineIssue[] {
  const existing = new Set(validateIntraopTimeline(before, context).map(issueKey))
  return validateIntraopTimeline(after, context).filter(issue => !existing.has(issueKey(issue)))
}

/**
 * The stamp for an entry made in a chart row: the exact minute when the row is
 * the one "now" falls in, otherwise the start of that row. Entering a stop in
 * the 21:30 row therefore records 21:30, not the moment the button was tapped.
 */
export function intraopStampForColumn({
  chartStart,
  column,
  now,
}: {
  chartStart: Date | string | number
  column: number
  now: Date | string | number
}): string {
  const startMs = ms(chartStart)
  const nowMs = ms(now)
  const rowStart = startMs + Math.max(0, Math.floor(column)) * INTRAOP_COLUMN_MS
  const nowColumn = Math.floor((nowMs - startMs) / INTRAOP_COLUMN_MS)
  if (Math.floor(column) === nowColumn) {
    const minute = Math.floor(nowMs / 60_000) * 60_000
    return new Date(Math.max(rowStart, minute)).toISOString()
  }
  return new Date(rowStart).toISOString()
}

/**
 * Ids to delete with an event. Deleting a start takes the changes and the stop
 * of that run with it; any other entry goes alone.
 */
export function intraopCascadeDeleteIds(events: LogEvent[], eventId: string): string[] {
  const target = events.find(event => event.id === eventId)
  if (!target) return []
  const ref = intraopItemRef(target)
  if (!ref || ref.role !== "start") return [eventId]
  const ordered = sortIntraopEvents(events)
  const index = ordered.findIndex(event => event.id === eventId)
  const ids = [eventId]
  for (const event of ordered.slice(index + 1)) {
    const other = intraopItemRef(event)
    if (ref.kind === "agent" && other?.role === "start" && other.kind === "agent" && other.key !== ref.key && event.agentMode !== "concurrent") {
      break // legacy: another agent's start ended this one
    }
    if (!other || other.kind !== ref.kind) continue
    const sameItem = other.key === ref.key
      || (ref.kind === "agent" && other.role === "stop" && !event.name && event.agentMode !== "concurrent")
    if (!sameItem) continue
    if (other.role === "start") break // the next run is a restart and stays
    ids.push(event.id)
    if (other.role === "stop") break
  }
  return ids
}

export type IntraopRunningItem = {
  kind: IntraopItemKind
  key: string
  /** The start event of the run. */
  startEvent: LogEvent
}

/** Items running at an instant, in the order they were started. */
export function intraopRunningItemsAt(
  events: LogEvent[],
  instant: Date | string | number,
): IntraopRunningItem[] {
  const atMs = ms(instant)
  const running = new Map<string, IntraopRunningItem>()
  for (const event of sortIntraopEvents(events)) {
    if (ms(event.ts) > atMs) break
    const ref = intraopItemRef(event)
    if (!ref) continue
    const id = itemId(ref.kind, ref.key)
    if (ref.role === "start") {
      if (ref.kind === "agent" && event.agentMode !== "concurrent") {
        for (const key of [...running.keys()]) if (key.startsWith("agent:") && key !== id) running.delete(key)
      }
      if (ref.kind === "gas" || !running.has(id)) running.set(id, { kind: ref.kind, key: ref.key, startEvent: event })
    } else if (ref.role === "stop") {
      if (ref.kind === "agent" && !event.name && event.agentMode !== "concurrent") {
        for (const key of [...running.keys()]) if (key.startsWith("agent:")) running.delete(key)
      } else {
        running.delete(id)
      }
    }
  }
  return [...running.values()]
}

/** Entries later than an instant: listed at End case, and they block finalisation. */
export function intraopEventsAfter(events: LogEvent[], instant: Date | string | number): LogEvent[] {
  const atMs = ms(instant)
  return sortIntraopEvents(events).filter(event => ms(event.ts) > atMs)
}

/**
 * The stop End case writes for an item the clinician chose to stop at the
 * end. Marked so that resuming the case can offer to remove exactly these.
 */
export function intraopEndCaseStopEvent(
  item: IntraopRunningItem,
  endedAt: Date | string | number,
): Omit<LogEvent, "id"> {
  const ts = new Date(ms(endedAt)).toISOString()
  switch (item.kind) {
    case "infusion": return { type: "infusion_stop", ts, infId: item.key, endCaseStop: true }
    case "fluid": return { type: "fluid_end", ts, fluidId: item.key, endCaseStop: true }
    case "agent": return { type: "agent_stop", ts, name: item.key, agentMode: "concurrent", endCaseStop: true }
    case "gas": return { type: "gas_stop", ts, endCaseStop: true }
  }
}

/** The stops End case wrote, which Resume offers to remove. */
export function intraopEndCaseStopIds(events: LogEvent[]): string[] {
  return events.filter(event => event.endCaseStop).map(event => event.id)
}

/**
 * Entries that would fall outside the case if its bounds moved: moving the end
 * earlier or the start later is refused while any are listed. Items running
 * at the end (continued postoperatively) have no entry past the end, so they
 * never block.
 */
export function intraopEntriesOutsideCase(
  events: LogEvent[],
  bounds: { startedAt?: Date | string | number | null; endedAt?: Date | string | number | null },
): LogEvent[] {
  const startMs = bounds.startedAt == null ? -Infinity : ms(bounds.startedAt)
  const endMs = bounds.endedAt == null ? Infinity : ms(bounds.endedAt)
  return sortIntraopEvents(events).filter(event => {
    const eventMs = ms(event.ts)
    return eventMs < startMs || eventMs > endMs
  })
}

/** Finalisation is blocked while planned entries remain after the case end. */
export function intraopCanFinalise(events: LogEvent[], endedAt: Date | string | number | null | undefined): boolean {
  if (endedAt == null) return false
  return intraopEventsAfter(events, endedAt).length === 0
}

/**
 * A case started this long ago, with nothing saved to it for as long, not
 * ended and on no open screen, ends on its own.
 */
export const INTRAOP_AUTO_END_AFTER_MS = 48 * 60 * 60_000

export function shouldAutoEndIntraopCase({
  startedAt,
  endedAt,
  now,
  screenOpenUntil,
  lastSavedAt,
}: {
  startedAt: Date | string | number | null | undefined
  endedAt: Date | string | number | null | undefined
  now: Date | string | number
  /** The live-screen heartbeat expiry (the case lock); null when no screen holds it. */
  screenOpenUntil?: Date | string | number | null
  /**
   * When anything was last saved to the intraoperative record. A case charted
   * retrospectively has a start days ago but is being worked on now: it is
   * never ended while that goes on. Only an abandoned case ends.
   */
  lastSavedAt?: Date | string | number | null
}): boolean {
  if (startedAt == null || endedAt != null) return false
  const nowMs = ms(now)
  if (nowMs - ms(startedAt) < INTRAOP_AUTO_END_AFTER_MS) return false
  if (lastSavedAt != null && nowMs - ms(lastSavedAt) < INTRAOP_AUTO_END_AFTER_MS) return false
  return screenOpenUntil == null || ms(screenOpenUntil) <= nowMs
}

/**
 * The end time an automatic end records: the last recorded entry that is not
 * in the future, or the case start when there is none.
 */
export function intraopAutoEndInstant(
  events: LogEvent[],
  startedAt: Date | string | number,
  now: Date | string | number,
): Date {
  const nowMs = ms(now)
  let latest = ms(startedAt)
  for (const event of events) {
    const eventMs = ms(event.ts)
    if (Number.isFinite(eventMs) && eventMs <= nowMs && eventMs > latest) latest = eventMs
  }
  return new Date(latest)
}
