import * as Haptics from "expo-haptics"
import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react"

import type { TimetableData } from "@/components/IntraopTimetable"
import { autosaveManager } from "@/lib/autosave-manager"
import { eventsToTimetable, roundDown5Min } from "@/lib/intraop-projection"
import {
  loadPendingIntraopEvents,
  markIntraopEventFailed,
  markIntraopEventSynced,
  removePendingIntraopEvent,
  serializeIntraopEventForServer,
  stripIntraopLogSyncStatuses,
  storePendingIntraopEvents,
} from "@/lib/pending-intraop-events"
import { uid, type LogEvent } from "@/lib/intraop-log-event"
import { notify } from "@/lib/notify"

type SyncState = "saved" | "saving" | "failed" | "offline"

type UseIntraopEventPersistenceArgs = {
  caseId: string
  entryTs: string | null
  setEntryTs: Dispatch<SetStateAction<string | null>>
  log: LogEvent[]
  logRef: MutableRefObject<LogEvent[]>
  startRef: MutableRefObject<Date | null>
  legacyWebLogNeedsSyncRef: MutableRefObject<boolean>
  baseIntraopUpdatedAtRef: MutableRefObject<string | null>
  enqueueEventSave: <T>(operation: () => Promise<T>) => Promise<T>
  setLog: Dispatch<SetStateAction<LogEvent[]>>
  setTimetable: Dispatch<SetStateAction<TimetableData>>
  setElapsedMs: Dispatch<SetStateAction<number>>
  setSyncState: Dispatch<SetStateAction<SyncState>>
  setLastSavedAt: Dispatch<SetStateAction<string | null>>
  setPendingCount: Dispatch<SetStateAction<number>>
  noteVitalsRef: MutableRefObject<() => void>
}

function sameEvent(a: LogEvent, b: LogEvent): boolean {
  return JSON.stringify(serializeIntraopEventForServer(a)) === JSON.stringify(serializeIntraopEventForServer(b))
}

export function useIntraopEventPersistence({
  caseId,
  entryTs,
  setEntryTs,
  log,
  logRef,
  startRef,
  legacyWebLogNeedsSyncRef,
  baseIntraopUpdatedAtRef,
  enqueueEventSave: _enqueueEventSave,
  setLog,
  setTimetable,
  setElapsedMs,
  setSyncState,
  setLastSavedAt,
  setPendingCount,
  noteVitalsRef,
}: UseIntraopEventPersistenceArgs) {
  const [undoEv, setUndoEv] = useState<LogEvent | null>(null)

  function seedLegacyRevision(): void {
    if (
      autosaveManager.getRevision(caseId, "intraop") == null &&
      baseIntraopUpdatedAtRef.current
    ) {
      autosaveManager.setRevision(caseId, "intraop", baseIntraopUpdatedAtRef.current)
    }
  }

  async function updateVisibleSyncState(silent = false): Promise<boolean> {
    const pending = await loadPendingIntraopEvents<LogEvent>(caseId)
    const mutations = await autosaveManager.eventMutations.load(caseId)
    const state = autosaveManager.getState(caseId)
    const pendingCount = pending.length + mutations.length
    setPendingCount(pendingCount)
    const saved = pendingCount === 0 && state.status !== "failed"
    setSyncState(saved ? "saved" : state.status === "queued" ? "offline" : "failed")
    if (saved) {
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
      setLog((current) => stripIntraopLogSyncStatuses(current) as LogEvent[])
      if (!silent) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    }
    return saved
  }

  async function migrateLegacyLog(events: LogEvent[]): Promise<void> {
    if (!legacyWebLogNeedsSyncRef.current) return
    for (const event of [...events].reverse()) {
      await autosaveManager.stageEventMutation({
        operationId: uid(),
        caseId,
        kind: "event.upsert",
        eventId: event.id,
        event: serializeIntraopEventForServer(event) as Record<string, unknown>,
        baseRevision: autosaveManager.getRevision(caseId, "intraop"),
        queuedAt: new Date().toISOString(),
      })
    }
    legacyWebLogNeedsSyncRef.current = false
  }

  async function save(
    partial: Omit<LogEvent, "id" | "ts">,
    tsOverride?: string,
    silent = false,
  ): Promise<LogEvent> {
    seedLegacyRevision()
    const event: LogEvent = {
      id: uid(),
      ts: tsOverride ?? entryTs ?? new Date().toISOString(),
      syncStatus: "pending",
      ...partial,
    }
    const next = [event, ...logRef.current]
    logRef.current = next
    setLog(next)
    setSyncState("saving")

    if (!startRef.current) {
      startRef.current = new Date(event.ts)
      setElapsedMs(0)
    }
    setTimetable(eventsToTimetable(next, roundDown5Min(startRef.current), new Date()))

    try {
      await migrateLegacyLog(next)
      await autosaveManager.appendEvent(caseId, event)
      const saved = await updateVisibleSyncState(silent)
      setLog((current) => saved
        ? markIntraopEventSynced(current, event.id) as LogEvent[]
        : markIntraopEventFailed(current, event.id) as LogEvent[])
      if (!silent) {
        setUndoEv(saved ? serializeIntraopEventForServer(event) as LogEvent : { ...event, syncStatus: "failed" })
        if (event.type === "vital") noteVitalsRef.current()
      }
    } catch {
      setLog((current) => markIntraopEventFailed(current, event.id) as LogEvent[])
      setSyncState("failed")
      if (!silent) {
        setUndoEv({ ...event, syncStatus: "failed" })
        notify("Saved locally", "The event is still on this device and will retry automatically.")
      }
    }
    setEntryTs(null)
    return event
  }

  async function syncLog(newLog: LogEvent[]) {
    seedLegacyRevision()
    const previousLog = log
    logRef.current = newLog
    setLog(newLog)
    if (startRef.current) {
      setTimetable(eventsToTimetable(newLog, roundDown5Min(startRef.current), new Date()))
    }
    setSyncState("saving")

    try {
      const previousById = new Map(previousLog.map((event) => [event.id, event]))
      const nextById = new Map(newLog.map((event) => [event.id, event]))

      for (const event of newLog) {
        const previous = previousById.get(event.id)
        if (previous && sameEvent(previous, event)) continue
        await autosaveManager.stageEventMutation({
          operationId: uid(),
          caseId,
          kind: "event.upsert",
          eventId: event.id,
          event: serializeIntraopEventForServer(event) as Record<string, unknown>,
          baseRevision: autosaveManager.getRevision(caseId, "intraop"),
          queuedAt: new Date().toISOString(),
        })
      }
      for (const event of previousLog) {
        if (nextById.has(event.id)) continue
        await autosaveManager.stageEventMutation({
          operationId: uid(),
          caseId,
          kind: "event.delete",
          eventId: event.id,
          baseRevision: autosaveManager.getRevision(caseId, "intraop"),
          queuedAt: new Date().toISOString(),
        })
      }
      legacyWebLogNeedsSyncRef.current = false
      const saved = await updateVisibleSyncState()
      if (!saved) notify("Saved locally", "The change will sync when the connection is available.")
    } catch {
      setSyncState("failed")
      notify("Saved locally", "The change is still on this device and will retry automatically.")
    }
  }

  async function retryPendingEvents() {
    seedLegacyRevision()
    setSyncState("saving")
    try {
      await migrateLegacyLog(logRef.current)
      await autosaveManager.flushCase(caseId)
      const saved = await updateVisibleSyncState()
      if (!saved) {
        const pending = await loadPendingIntraopEvents<LogEvent>(caseId)
        notify("Still offline", `${pending.length} event${pending.length === 1 ? "" : "s"} still waiting.`)
      }
    } catch {
      setSyncState("failed")
      notify("Still offline", "Changes remain safely stored on this device.")
    }
  }

  async function removeEvent(event: LogEvent, sync = true) {
    const next = log.filter((item) => item.id !== event.id)
    const remainingPending = removePendingIntraopEvent(
      await loadPendingIntraopEvents<LogEvent>(caseId),
      event.id,
    )
    await storePendingIntraopEvents(caseId, remainingPending)
    setPendingCount(remainingPending.length)
    setLog(next)
    if (startRef.current) setTimetable(eventsToTimetable(next, roundDown5Min(startRef.current)))
    if (sync && !event.syncStatus) await syncLog(next)
    else setSyncState(remainingPending.length > 0 ? "failed" : "saved")
  }

  async function undoLastEvent() {
    if (!undoEv) return
    await removeEvent(undoEv)
    setUndoEv(null)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
  }

  return {
    save,
    syncLog,
    retryPendingEvents,
    removeEvent,
    undoLastEvent,
    undoEv,
    setUndoEv,
  }
}
