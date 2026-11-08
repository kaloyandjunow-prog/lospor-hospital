import { useEffect, useRef } from "react"
import type { LogEvent } from "@lospor/core/intraop-types"

/**
 * Events charted on the timeline that the record has no entry for yet, handed
 * out one at a time, oldest first, each only once. Events already present when
 * the screen opens are never offered. Used for airway and vascular pickers that
 * open on a charted "Intubated", "IV line in" and the like.
 */
export function usePendingChartedEvents({ log, readOnly, matches, isLinked, canOpen, onOpen }: {
  log: readonly LogEvent[]
  readOnly: boolean
  matches: (event: LogEvent) => boolean
  /** Whether the record already holds an entry for this event. */
  isLinked: (event: LogEvent) => boolean
  /** False while something else holds the screen; pending events wait. */
  canOpen: boolean
  onOpen: (event: LogEvent) => void
}) {
  const seen = useRef<Set<string> | null>(null)
  const pending = useRef<Map<string, LogEvent>>(new Map())
  const opened = useRef<Set<string>>(new Set())
  const latest = useRef({ matches, isLinked, onOpen })
  useEffect(() => { latest.current = { matches, isLinked, onOpen } })
  useEffect(() => {
    if (readOnly) return
    const events = log.filter(event => event.type === "clinical_event" && latest.current.matches(event))
    if (seen.current == null) { seen.current = new Set(events.map(event => event.id)); return }
    for (const event of events) {
      if (seen.current.has(event.id)) continue
      seen.current.add(event.id)
      if (!latest.current.isLinked(event)) pending.current.set(event.id, event)
    }
    if (!canOpen) return
    const fresh = [...pending.current.values()]
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
      .find(event => !opened.current.has(event.id))
    if (fresh) {
      opened.current.add(fresh.id)
      pending.current.delete(fresh.id)
      latest.current.onOpen(fresh)
    }
  }, [log, readOnly, canOpen])
}
