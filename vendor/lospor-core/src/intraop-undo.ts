import type { LogEvent } from "./intraop-types"
import { sameEventJson } from "./intraop-edits"

/**
 * Undo and redo of chart edits, many steps (10.8.0), the same in the web app
 * and the PWA. An entry keeps only the events one edit touched, as they were
 * before and after, so undoing an edit made offline is itself an ordinary edit
 * that the offline queue sends like any other.
 */

export type IntraopUndoEntry = {
  /** What the edit did, for the Undo bar ("Sevoflurane stopped at 10:45"). */
  label: string
  /** The touched events before the edit; an id missing here was added by it. */
  before: LogEvent[]
  /** The touched events after the edit; an id missing here was removed by it. */
  after: LogEvent[]
}

function same(a: LogEvent, b: LogEvent): boolean {
  return sameEventJson(a, b)
}

/** The entry for an edit from the log before to the log after; null when nothing changed. */
export function intraopUndoEntry(previous: LogEvent[], next: LogEvent[], label: string): IntraopUndoEntry | null {
  const before = new Map(previous.map(event => [event.id, event]))
  const after = new Map(next.map(event => [event.id, event]))
  const touched = new Set<string>()
  for (const [id, event] of before) {
    const now = after.get(id)
    if (!now || !same(event, now)) touched.add(id)
  }
  for (const id of after.keys()) if (!before.has(id)) touched.add(id)
  if (touched.size === 0) return null
  return {
    label,
    before: [...touched].map(id => before.get(id)).filter((event): event is LogEvent => !!event),
    after: [...touched].map(id => after.get(id)).filter((event): event is LogEvent => !!event),
  }
}

/**
 * Puts events back. They are stamped as made now: the server keeps the last change made (a deletion made
 * after an entry was added outranks the add), so an entry brought back with its old time would be refused
 * as superseded by the very deletion it undoes.
 */
function replace(events: LogEvent[], remove: LogEvent[], put: LogEvent[], now: Date): LogEvent[] {
  const removeIds = new Set([...remove.map(event => event.id), ...put.map(event => event.id)])
  const stamp = now.toISOString()
  return [...events.filter(event => !removeIds.has(event.id)), ...put.map(event => ({ ...event, recordedAt: stamp }))]
}

/** The log with an edit undone. */
export function intraopApplyUndo(events: LogEvent[], entry: IntraopUndoEntry, now: Date = new Date()): LogEvent[] {
  return replace(events, entry.after, entry.before, now)
}

/** The log with an undone edit made again. */
export function intraopApplyRedo(events: LogEvent[], entry: IntraopUndoEntry, now: Date = new Date()): LogEvent[] {
  return replace(events, entry.before, entry.after, now)
}

/** A bounded history: newest last; a new edit clears what could be redone. */
export type IntraopHistory = { done: IntraopUndoEntry[]; undone: IntraopUndoEntry[] }

export const INTRAOP_HISTORY_LIMIT = 50
export const EMPTY_INTRAOP_HISTORY: IntraopHistory = Object.freeze({ done: [], undone: [] }) as IntraopHistory

export function intraopHistoryPush(history: IntraopHistory, entry: IntraopUndoEntry | null): IntraopHistory {
  if (!entry) return history
  return { done: [...history.done, entry].slice(-INTRAOP_HISTORY_LIMIT), undone: [] }
}

export function intraopHistoryUndo(history: IntraopHistory, events: LogEvent[]): { history: IntraopHistory; events: LogEvent[]; entry: IntraopUndoEntry } | null {
  const entry = history.done[history.done.length - 1]
  if (!entry) return null
  return { history: { done: history.done.slice(0, -1), undone: [...history.undone, entry] }, events: intraopApplyUndo(events, entry), entry }
}

export function intraopHistoryRedo(history: IntraopHistory, events: LogEvent[]): { history: IntraopHistory; events: LogEvent[]; entry: IntraopUndoEntry } | null {
  const entry = history.undone[history.undone.length - 1]
  if (!entry) return null
  return { history: { done: [...history.done, entry], undone: history.undone.slice(0, -1) }, events: intraopApplyRedo(events, entry), entry }
}
