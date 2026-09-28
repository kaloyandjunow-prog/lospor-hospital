import { serverNow } from "@/lib/intraop-clock"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { LogEvent } from "@/types/timetable"
import { autosaveManager, onEventRefused } from "@/lib/autosave-manager"
import { randomId } from "@/lib/random-id"
import { applyIntraopEventOps, type IntraopEventOps } from "@lospor/core/intraop-timetable-edit"

/** The timeline rules with a message of their own (intraop.timelineRules.refused). */
const TIMELINE_RULE_CODES = new Set([
  "STOP_BEFORE_START", "NOT_RUNNING", "STOP_BEFORE_LATER_CHANGE", "ALREADY_RUNNING",
  "FUTURE_VITAL", "BEFORE_CASE_START", "AFTER_CASE_END",
  // A later change to the entry was made on another screen (9.13.0).
  "SUPERSEDED",
])

/**
 * The intraoperative event journal. Every chart change is one set of Core
 * operations (applyEventOps), staged through the outbox so an entry made in
 * theatre survives losing the network. The older per-entry handlers were
 * removed in 9.13.0: nothing called them, and they read the log as last
 * rendered, so an edit right after an add could be sent as a second add.
 */
export function useCaseEventLog(caseIdRef: { current: string | null }, t: (key: string) => string) {
  const [eventLog, setEventLog] = useState<LogEvent[]>([])

  // A refused entry is said so and taken off the chart; an edit or removal the
  // server refused is undone by reading the saved log back (9.12.1).
  useEffect(() => onEventRefused(({ caseId, eventId, code }) => {
    if (caseId !== caseIdRef.current) return
    toast.error(code && TIMELINE_RULE_CODES.has(code) ? t(`intraop.timelineRules.refused.${code}`) : t("case.timelineEditFailed"))
    fetch(`/api/cases/${caseId}`)
      .then(response => response.ok ? response.json() : null)
      .then(record => {
        const log = record?.intraop?.keyEvents?.log
        if (Array.isArray(log)) setEventLog(log as LogEvent[])
        else setEventLog(prev => prev.filter(event => event.id !== eventId))
      })
      .catch(() => setEventLog(prev => prev.filter(event => event.id !== eventId)))
  }), [caseIdRef, t])

  /**
   * Applies one timeline edit (1.4.9): the adds, updates and removals the
   * Core edit translation produced, in one state change, each staged in the
   * outbox. The chart is the projection of this log; nothing else is saved.
   */
  async function applyEventOps(ops: IntraopEventOps) {
    const caseId = caseIdRef.current
    if (!caseId) return
    setEventLog(prev => applyIntraopEventOps(prev as Parameters<typeof applyIntraopEventOps>[0], ops) as LogEvent[])
    const base = () => autosaveManager.getRevision(caseId, "intraop")
    try {
      for (const eventId of ops.remove) {
        await autosaveManager.stageEventMutation({
          operationId: `web-delete-${randomId()}`, caseId, kind: "event.delete", eventId,
          baseRevision: base(), queuedAt: serverNow().toISOString(),
        })
      }
      for (const event of ops.update) {
        await autosaveManager.stageEventMutation({
          operationId: `web-upsert-${randomId()}`, caseId, kind: "event.upsert", eventId: event.id,
          event: event as Record<string, unknown>, baseRevision: base(), queuedAt: serverNow().toISOString(),
        })
      }
      for (const event of ops.add) {
        await autosaveManager.appendEvent(caseId, event as Record<string, unknown> & { id: string })
      }
    } catch {
      // A fixed code only: runtime logs never carry case data (9.12.1).
      console.error("[intraop event] EVENT_JOURNAL_FAILED")
      toast.error(t("case.timelineEditFailed"))
    }
  }

  return { eventLog, setEventLog, applyEventOps }
}
