import { useEffect, useRef } from "react"
import type { LogEvent } from "@/lib/intraop-log-event"

/** The event a death in theatre is charted as (10.2.0). */
export const DEATH_EVENT_LABEL = "Death (exitus letalis)"

/**
 * A death charted on this screen (10.2.0) calls onDeath once: the screen sets
 * the postop destination to Deceased and offers End case. A death already on
 * the case when the screen opened asks nothing; a watching screen nothing.
 */
export function usePhoneDeathPrompt(log: readonly LogEvent[], active: boolean, onDeath: () => void) {
  const seen = useRef<Set<string> | null>(null)
  const onDeathRef = useRef(onDeath)
  onDeathRef.current = onDeath
  useEffect(() => {
    if (!active) return
    const deaths = log.filter(event => event.type === "clinical_event" && event.label === DEATH_EVENT_LABEL)
    if (seen.current == null) { seen.current = new Set(deaths.map(event => event.id)); return }
    const known = seen.current
    const fresh = deaths.find(event => !known.has(event.id))
    for (const event of deaths) known.add(event.id)
    if (fresh) onDeathRef.current()
  }, [log, active])
}
