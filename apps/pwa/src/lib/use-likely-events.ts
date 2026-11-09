import { useEffect, useMemo, useRef, useState } from "react"
import { likelyNext, successionContext, successionDismissedIds, SUCCESSION_ANSWER_KIND, SUCCESSION_DISMISS_ANSWER, type LikelyEvent, type SuccessionStructuredRecords } from "@lospor/core/event-succession"
import { successionDismissalEventId } from "@lospor/core/intraop-automation-actions"
import { useIntraopAutomation } from "@/lib/use-intraop-automation"
import { usePreferences } from "@/lib/preferences-context"
import type { SaveIntraopEvent } from "@/lib/intraop-stamp"

/**
 * The events likely to come next on this case (10.2.0): at most two, only ones not yet charted, once the usual gap has
 * passed after the event they follow. Nothing when the reminders are off in Status or for this clinician, or the case
 * is open on another screen. What is likely, and why, is Core's (event-succession); this only hands it the case.
 */
export function useLikelyEvents({ log, structured, techniques, child, enabled, save }: {
  log: ReadonlyArray<{ type: string; label?: string | null; ts: string; answerKind?: string; answerFor?: string; answer?: string; suggestion?: string }>
  structured?: SuccessionStructuredRecords
  techniques: readonly string[]
  child: boolean
  enabled: boolean
  save?: SaveIntraopEvent
}): { likely: LikelyEvent[]; dismiss: (suggestionId: string) => void } {
  const { settings, succession, ready } = useIntraopAutomation()
  const { automationGroups, automationLines } = usePreferences()
  const user = useMemo(() => ({ ...automationGroups, automationLines }), [automationGroups, automationLines])
  const [now, setNow] = useState(() => Date.now())
  const dismissalInFlight = useRef(new Set<string>())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const likely = useMemo(() => {
    if (ready === false || !enabled) return []
    return likelyNext({
      log: log.filter(event => event.type === "clinical_event").map(event => ({ label: event.label, ts: event.ts })),
      structured,
      context: successionContext(techniques, child), links: succession, now, dismissed: successionDismissedIds(log), settings, user,
    })
  }, [ready, enabled, log, structured, techniques, child, succession, now, settings, user])
  return {
    likely,
    dismiss: suggestionId => {
      if (!save || !suggestionId.startsWith("succession:")) return
      if (dismissalInFlight.current.has(suggestionId)) return
      dismissalInFlight.current.add(suggestionId)
      try {
        void save({ id: successionDismissalEventId(suggestionId), type: "prompt_answer", answerKind: SUCCESSION_ANSWER_KIND, answerFor: suggestionId, answer: SUCCESSION_DISMISS_ANSWER, suggestion: suggestionId })
          .finally(() => dismissalInFlight.current.delete(suggestionId))
          .catch(() => {})
      } catch {
        dismissalInFlight.current.delete(suggestionId)
      }
    },
  }
}
