import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { LogEvent } from "@/types/timetable"
import { autosaveManager, onEventRefused } from "@/lib/autosave-manager"
import { randomId } from "@/lib/random-id"
import { applyIntraopEventOps, type IntraopEventOps } from "@lospor/core/intraop-timetable-edit"

/**
 * The intraoperative event journal: the timeline's own append/replace/delete
 * plumbing, lifted out of the case wizard because none of it is wizard logic.
 * Every write goes through the outbox rather than straight to the server, so an
 * event recorded in theatre survives losing the network on the way out of it.
 */
/** The timeline rules with a message of their own (intraop.timelineRules.refused). */
const TIMELINE_RULE_CODES = new Set([
  "STOP_BEFORE_START", "NOT_RUNNING", "STOP_BEFORE_LATER_CHANGE", "ALREADY_RUNNING",
  "FUTURE_VITAL", "BEFORE_CASE_START", "AFTER_CASE_END",
])

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

  async function handleDeleteEvent(evId: string) {
    const caseId = caseIdRef.current
    if (!caseId) return
    setEventLog(prev => prev.filter(e => e.id !== evId))
    try {
      await autosaveManager.stageEventMutation({
        operationId: `web-delete-${randomId()}`,
        caseId,
        kind: "event.delete",
        eventId: evId,
        baseRevision: autosaveManager.getRevision(caseId, "intraop"),
        queuedAt: new Date().toISOString(),
      })
    } catch {
      toast.error(t("case.timelineEditFailed"))
    }
  }

  async function handleLogEvent(event: LogEvent) {
    const caseId = caseIdRef.current
    if (!caseId) return
    const durableEvent = { ...event, id: event.id ?? randomId() }
    // Editing an existing entry has to replace it rather than append beside it;
    // the id is what tells the two apart.
    const replacesExisting = eventLog.some(item => item.id === durableEvent.id)
    setEventLog(prev => [durableEvent, ...prev.filter(e => e.id !== durableEvent.id)])
    try {
      if (replacesExisting) {
        await autosaveManager.stageEventMutation({
          operationId: `web-upsert-${randomId()}`,
          caseId,
          kind: "event.upsert",
          eventId: durableEvent.id,
          event: durableEvent as Record<string, unknown>,
          baseRevision: autosaveManager.getRevision(caseId, "intraop"),
          queuedAt: new Date().toISOString(),
        })
      } else {
        await autosaveManager.appendEvent(caseId, durableEvent as Record<string, unknown> & { id: string })
      }
    } catch {
      console.error("[intraop event] EVENT_JOURNAL_FAILED")
      toast.error(t("case.timelineEditFailed"))
    }
  }

  /** Removing an infusion or a fluid removes every timeline entry it produced. */
  async function handleLogEventDelete(match: { infId?: string; fluidId?: string }) {
    const caseId = caseIdRef.current
    if (!caseId) return
    const key = match.infId ? "infId" : "fluidId"
    const value = match.infId ?? match.fluidId
    if (!value) return
    const newLog = eventLog.filter(e => e[key] !== value)
    if (newLog.length === eventLog.length) return
    const removed = eventLog.filter(e => e[key] === value && e.id)
    setEventLog(newLog)
    try {
      for (const event of removed) {
        await autosaveManager.stageEventMutation({
          operationId: `web-delete-${randomId()}`,
          caseId,
          kind: "event.delete",
          eventId: event.id!,
          baseRevision: autosaveManager.getRevision(caseId, "intraop"),
          queuedAt: new Date().toISOString(),
        })
      }
    } catch {
      toast.error(t("case.timelineEditFailed"))
    }
  }

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
          baseRevision: base(), queuedAt: new Date().toISOString(),
        })
      }
      for (const event of ops.update) {
        await autosaveManager.stageEventMutation({
          operationId: `web-upsert-${randomId()}`, caseId, kind: "event.upsert", eventId: event.id,
          event: event as Record<string, unknown>, baseRevision: base(), queuedAt: new Date().toISOString(),
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

  return { eventLog, setEventLog, handleDeleteEvent, handleLogEvent, handleLogEventDelete, applyEventOps }
}
