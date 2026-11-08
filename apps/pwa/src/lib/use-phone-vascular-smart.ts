import { useEffect, useRef, useState } from "react"
import type { VascularLine } from "@lospor/core/vascular-access-lines"
import { VASCULAR_EVENT_TYPE } from "@lospor/core/vascular-smart"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { VascularSmartRequest } from "@/components/intraop/VascularSmartPanel"

/**
 * Smart selection for vascular access, from the timeline (10.2.0): IV line in, Art line in, CVC in
 * and PICC charted on this screen open the panel with that time already set. One already on the
 * list at that time, or one that was on the case when it loaded, does not.
 */
export function usePhoneVascularEvents({ log, active, smart = false, lines }: {
  log: readonly LogEvent[]
  /** Smart selection is on, and this screen holds the case. */
  active: boolean
  /** Keep an unreconciled event pending while the legacy screen is selected. */
  smart?: boolean
  lines: () => readonly VascularLine[]
}) {
  const [request, setRequest] = useState<VascularSmartRequest | null>(null)
  const seen = useRef<Set<string> | null>(null)
  const pending = useRef<Map<string, LogEvent>>(new Map())
  const opened = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!active) return
    const events = log.filter(event => event.type === "clinical_event" && event.label != null && VASCULAR_EVENT_TYPE[event.label])
    if (seen.current == null) { seen.current = new Set(events.map(event => event.id)); return }
    const known = seen.current
    for (const event of events) {
      if (known.has(event.id)) continue
      known.add(event.id)
      const currentLines = lines()
      const exactLink = currentLines.some(line => line.sourceEventId === event.id)
      const legacyMatches = currentLines.filter(line => line.insertedAt === event.ts)
      const linked = exactLink || Array.isArray(event.intraopPatch?.vascularAccesses)
        || (!event.sourceEventId && legacyMatches.length === 1)
      if (!linked) pending.current.set(event.id, event)
    }
    if (!smart) return
    const fresh = [...pending.current.values()]
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
      .find(event => !opened.current.has(event.id))
    if (fresh?.label) {
      opened.current.add(fresh.id)
      pending.current.delete(fresh.id)
      setRequest({ ...VASCULAR_EVENT_TYPE[fresh.label]!, at: fresh.ts, source: "timeline", eventId: fresh.id, eventLabel: fresh.label })
    }
  }, [log, active, smart, lines])
  return { request, setRequest }
}
