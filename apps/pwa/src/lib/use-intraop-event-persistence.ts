import * as Haptics from "expo-haptics"
import { serverNow } from "@/lib/server-clock"
import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react"

import type { TimetableData } from "@/components/IntraopTimetable"
import { autosaveManager } from "@/lib/autosave-manager"
import { eventsToTimetable, roundDown5Min } from "@/lib/intraop-projection"
import {
  loadPendingIntraopEvents,
  markIntraopEventFailed,
  markIntraopEventSynced,
  serializeIntraopEventForServer,
  stripIntraopLogSyncStatuses,
} from "@/lib/pending-intraop-events"
import { uid, type LogEvent } from "@/lib/intraop-log-event"
import { planEventMutations } from "@/lib/intraop-event-mutations"
import { notify } from "@/lib/notify"
import { formatMessage } from "@/i18n/locale"
import { usePreferences } from "@/lib/preferences-context"
import { resolveRowStamp, type RowStamp } from "@/lib/intraop-stamp"
import { timelineRefusalMessageKey } from "@/lib/intraop-timeline-refusal"
import {
  intraopCascadeDeleteIds,
  newIntraopTimelineIssues,
  stampEnteredEvents,
} from "@lospor/core/intraop-commands"

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
  /** Rebuilds running items from the saved log after an entry is refused. */
  resyncActiveRef?: MutableRefObject<() => void>
  /** The case end once ended: the chart is then read at the end. */
  endedAtRef?: MutableRefObject<Date | null>
}

export function useIntraopEventPersistence({
  caseId,
  entryTs,
  setEntryTs,
  log: _log,
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
  resyncActiveRef,
  endedAtRef,
}: UseIntraopEventPersistenceArgs) {
  const { t, tc } = usePreferences()
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
        queuedAt: serverNow().toISOString(),
      })
    }
    legacyWebLogNeedsSyncRef.current = false
  }

  /**
   * The Core timeline rules refuse an entry (a stop before its start, a vital
   * in the future, ...). Only problems the edit introduces count, so an older
   * record that already breaks a rule stays editable.
   */
  function refused(before: LogEvent[], after: LogEvent[]): boolean {
    const messageKey = timelineRefusalMessageKey(newIntraopTimelineIssues(before, after, { now: serverNow() }))
    if (!messageKey) return false
    notify(tc("timelineRefusedTitle"), tc(messageKey))
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
    resyncActiveRef?.current()
    return true
  }

  // Returns null when the timeline rules refuse the entry; nothing is saved.
  async function save(
    partial: Omit<LogEvent, "id" | "ts">,
    tsOverride?: string | RowStamp,
    silent = false,
  ): Promise<LogEvent | null> {
    seedLegacyRevision()
    const chartStart = startRef.current ? roundDown5Min(startRef.current) : null
    const ts = typeof tsOverride === "string"
      ? tsOverride
      : resolveRowStamp(tsOverride ? tsOverride.rowTs : entryTs, chartStart)
    const event: LogEvent = {
      id: uid(),
      ts,
      // When it was entered, beside when it happened: a stop dated ahead of
      // its entry is asked about when its time comes (9.13.0).
      recordedAt: serverNow().toISOString(),
      syncStatus: "pending",
      ...partial,
    }
    if (refused(logRef.current, [event, ...logRef.current])) {
      setEntryTs(null)
      return null
    }
    const next = [event, ...logRef.current]
    logRef.current = next
    setLog(next)
    setSyncState("saving")

    if (!startRef.current) {
      startRef.current = new Date(event.ts)
      setElapsedMs(0)
    }
    setTimetable(eventsToTimetable(next, roundDown5Min(startRef.current), serverNow(), endedAtRef?.current))

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
        notify(t("savedLocally"), tc("eventSavedLocalRetry"))
      }
    }
    setEntryTs(null)
    return event
  }

  async function syncLog(edited: LogEvent[]): Promise<boolean> {
    seedLegacyRevision()
    // The log as last written, not as last rendered: an answer or an End case
    // step can edit right after a save, before the screen re-renders, and a
    // diff against the rendered log re-sent the entry just saved.
    const previousLog = logRef.current
    if (refused(previousLog, edited)) return false
    // Re-timed events get a new entry time; a moved stop is a new guess.
    const newLog = stampEnteredEvents(previousLog, edited, serverNow())
    logRef.current = newLog
    setLog(newLog)
    if (startRef.current) {
      setTimetable(eventsToTimetable(newLog, roundDown5Min(startRef.current), serverNow(), endedAtRef?.current))
    }
    setSyncState("saving")

    try {
      for (const mutation of planEventMutations(previousLog, newLog)) {
        await autosaveManager.stageEventMutation({
          operationId: uid(),
          caseId,
          ...mutation,
          baseRevision: autosaveManager.getRevision(caseId, "intraop"),
          queuedAt: serverNow().toISOString(),
        })
      }
      legacyWebLogNeedsSyncRef.current = false
      const saved = await updateVisibleSyncState()
      if (!saved) notify(t("savedLocally"), tc("changeSyncWhenOnline"))
    } catch {
      setSyncState("failed")
      notify(t("savedLocally"), tc("changeSavedLocalRetry"))
    }
    return true
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
        notify(
          tc("stillOffline"),
          pending.length === 1
            ? tc("oneEventWaiting")
            : formatMessage(tc("eventsWaiting"), { count: pending.length }),
        )
      }
    } catch {
      setSyncState("failed")
      notify(tc("stillOffline"), tc("changesSafeOnDevice"))
    }
  }

  // Deleting a start takes its changes and its stop with it (Core rule).
  // Every deletion is staged through the autosave manager, which decides
  // under the case's write lock (9.13.0): an entry that never left the device
  // is cancelled there, and one being sent right now is deleted after it
  // arrives. This used to edit the unsent queue itself, outside that lock --
  // so an entry queued meanwhile could be wiped from the queue, and an entry
  // deleted mid-send was saved anyway and came back on the next reload.
  async function removeEvent(event: LogEvent) {
    const current = logRef.current
    const ids = new Set(intraopCascadeDeleteIds(current, event.id))
    ids.add(event.id)
    await syncLog(current.filter((item) => !ids.has(item.id)))
  }

  async function undoLastEvent() {
    if (!undoEv) return
    await removeEvent(undoEv)
    setUndoEv(null)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
  }

  function stampFor(rowTs?: string | null): string {
    return resolveRowStamp(rowTs, startRef.current ? roundDown5Min(startRef.current) : null)
  }

  return {
    save,
    stampFor,
    syncLog,
    retryPendingEvents,
    removeEvent,
    undoLastEvent,
    undoEv,
    setUndoEv,
  }
}
