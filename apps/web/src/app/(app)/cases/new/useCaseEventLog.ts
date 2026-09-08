import { useState } from "react"
import { toast } from "sonner"
import type { LogEvent } from "@/types/timetable"
import { autosaveManager } from "@/lib/autosave-manager"
import { randomId } from "@/lib/random-id"

/**
 * The intraoperative event journal: the timeline's own append/replace/delete
 * plumbing, lifted out of the case wizard because none of it is wizard logic.
 * Every write goes through the outbox rather than straight to the server, so an
 * event recorded in theatre survives losing the network on the way out of it.
 */
export function useCaseEventLog(caseIdRef: { current: string | null }, t: (key: string) => string) {
  const [eventLog, setEventLog] = useState<LogEvent[]>([])

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
      // A fixed code and nothing else. The error carries the case id and the
      // event's own contents, and on an appliance that lands in logs the
      // operator can read and the backups keep.
      console.error("[intraop-event] JOURNAL_FAILED")
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

  return { eventLog, setEventLog, handleDeleteEvent, handleLogEvent, handleLogEventDelete }
}
