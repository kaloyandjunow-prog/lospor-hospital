import { intraopCascadeDeleteIds } from "@lospor/core/intraop-commands"
import type { LogEvent } from "@/lib/intraop-log-event"

/**
 * What a clinician's delete takes off the chart: the entry, and for a start
 * its changes and stop (Core rule). Kept so Undo can put them back (9.14.2).
 */
export function removalOf(log: readonly LogEvent[], event: LogEvent): { kept: LogEvent[]; removed: LogEvent[] } {
  const ids = new Set(intraopCascadeDeleteIds(log as LogEvent[], event.id))
  ids.add(event.id)
  return {
    kept: log.filter(item => !ids.has(item.id)),
    removed: log.filter(item => ids.has(item.id)),
  }
}

/**
 * The removed entries back on the chart, as new entries.
 *
 * The server has recorded the delete, so the old ids are spent; each comes back
 * with a new id and is saved like any other entry, without its old sync state
 * or entry time. Its time and its item identity (infId, drugId, ...) are kept,
 * so a start finds its changes and stop again -- which is how the web's undo
 * restores a removal too.
 */
export function restoreRemoved(log: readonly LogEvent[], removed: readonly LogEvent[], newId: () => string): LogEvent[] {
  const restored = removed.map(event => {
    const copy: LogEvent = { ...event, id: newId() }
    delete copy.syncStatus
    delete copy.recordedAt
    return copy
  })
  return [...log, ...restored]
}
