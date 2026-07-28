// Compatibility facade over the v5.6 Autosave Manager's durable event journal.
import {
  type DroppedEvent,
  type PendingEvent,
} from "@lospor/core/sync"

import { autosaveManager } from "./autosave-manager"

export {
  mergeLogWithPendingEvents as mergeLogWithPendingIntraopEvents,
  markEventFailed as markIntraopEventFailed,
  markEventSynced as markIntraopEventSynced,
  prependPendingEvent as prependPendingIntraopEvent,
  removePendingEvent as removePendingIntraopEvent,
  serializeEventForServer as serializeIntraopEventForServer,
  serializeLogForServer as serializeIntraopLogForServer,
  stripEventSyncStatus as stripIntraopEventSyncStatus,
  stripLogSyncStatuses as stripIntraopLogSyncStatuses,
} from "@lospor/core/sync"

type PendingIntraopEvent = PendingEvent
const store = autosaveManager.pendingEvents

export function markPendingIntraopCase(caseId: string, hasPending: boolean): Promise<void> {
  return store.markPendingCase(caseId, hasPending)
}

export function loadPendingIntraopEvents<T extends PendingIntraopEvent = PendingIntraopEvent>(
  caseId: string,
): Promise<T[]> {
  return store.loadPending<T>(caseId)
}

export function storePendingIntraopEvents<T extends PendingIntraopEvent>(
  caseId: string,
  events: T[],
): Promise<void> {
  return store.storePending(caseId, events)
}

export function getDroppedIntraopEvents(): Promise<DroppedEvent[]> {
  return store.droppedEvents()
}

export function clearDroppedIntraopEvents(): Promise<void> {
  return store.clearDropped()
}

export function clearAllPendingIntraopEvents(): Promise<number> {
  return store.clearAll()
}

export function flushPendingIntraopEvents(): Promise<{ saved: number; failed: number }> {
  return store.flushAll()
}
