// Pending intraop-event journal: events are captured optimistically on the
// device and replayed to the server until acknowledged. Ported from
// lospor-mobile/src/lib/pending-intraop-events.ts (v4.1.x) with storage and
// transport injected. Defenses preserved:
//
//  - server appends are idempotent (dedup by event id), so replaying an event
//    whose original POST actually succeeded is a safe no-op
//  - permanently rejected events (400/403/404) are moved to a "dropped" log
//    instead of being silently discarded or retried forever
//  - 401 (auth expired) and 409 stop the batch (transient; retried after
//    re-login / refresh), 5xx keeps the event for a later pass
//
// STORAGE KEYS are identical to the historical mobile keys so devices with
// queued events survive the upgrade.

import type { KVAdapter, SectionRevision } from "./protocol"
import { createSingleFlightQueue } from "./single-flight-queue"

export type PendingEvent = {
  id: string
  syncStatus?: unknown
  [key: string]: unknown
}

export type DroppedEvent = {
  caseId: string
  event: Omit<PendingEvent, "syncStatus">
  status: number
  droppedAt: string
}

// ─── Pure list/serialization helpers (no IO) ────────────────────────────────

export function stripEventSyncStatus<T extends { syncStatus?: unknown }>(ev: T): Omit<T, "syncStatus"> {
  const { syncStatus: _syncStatus, ...clean } = ev
  return clean
}

export function serializeEventForServer<T extends PendingEvent>(ev: T): Omit<T, "syncStatus"> {
  return stripEventSyncStatus(ev)
}

export function prependPendingEvent<T extends PendingEvent>(pending: T[], event: T): T[] {
  return [event, ...pending.filter((item) => item.id !== event.id)]
}

export function removePendingEvent<T extends PendingEvent>(pending: T[], eventId: string): T[] {
  return pending.filter((item) => item.id !== eventId)
}

export function markEventSynced<T extends PendingEvent>(log: T[], eventId: string): T[] {
  return log.map((item) => (item.id === eventId ? (serializeEventForServer(item) as T) : item))
}

export function markEventFailed<T extends PendingEvent>(log: T[], eventId: string): T[] {
  return log.map((item) => (item.id === eventId ? { ...item, syncStatus: "failed" } : item))
}

export function stripLogSyncStatuses<T extends PendingEvent>(log: T[]): Omit<T, "syncStatus">[] {
  return log.map(serializeEventForServer)
}

export function serializeLogForServer<T extends PendingEvent>(
  newestFirstLog: T[],
): { log: Omit<T, "syncStatus">[] } {
  return { log: [...newestFirstLog].reverse().map(serializeEventForServer) }
}

export function mergeLogWithPendingEvents<T extends { id: string; ts: string }>(
  serverLog: T[],
  pending: T[],
): T[] {
  const seen = new Set<string>()
  return [...pending, ...serverLog]
    .filter((ev) => {
      if (seen.has(ev.id)) return false
      seen.add(ev.id)
      return true
    })
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
}

// ─── Persistent store + replay (IO injected) ────────────────────────────────

export const PENDING_EVENTS_INDEX_KEY = "lospor_pending_intraop_index"
export const DROPPED_EVENTS_KEY = "lospor_intraop_dropped"

export function pendingEventsKey(caseId: string): string {
  return `lospor_pending_intraop_${caseId}`
}

/** Outcome of one POST attempt, normalized away from fetch specifics. */
export type PostEventResult = {
  ok: boolean
  status: number
  revision?: SectionRevision
  serverRevision?: SectionRevision
}

export type PendingEventStoreDeps = {
  kv: KVAdapter
  /** POST one event (with its idempotency key). May throw on network failure. */
  postEvent: (
    caseId: string,
    event: Omit<PendingEvent, "syncStatus">,
    revision?: SectionRevision,
  ) => Promise<PostEventResult>
  getRevision?: (caseId: string) => SectionRevision
  /** True when a thrown error means "no connectivity" (stop the batch). */
  isNetworkError: (err: unknown) => boolean
  /** Per-case write ordering (share the app's CaseWriteQueue). */
  orderWrite?: <T>(caseId: string, run: () => Promise<T>) => Promise<T>
  /**
   * Best-effort notification after the journal changes, with the total number
   * of pending events across all cases — lets UI badges track the queue live.
   * Never awaited; errors swallowed.
   */
  onChange?: (totalPending: number) => void
  /** Fresh intraop revision returned after an acknowledged event append. */
  onAcknowledged?: (caseId: string, revision: string | number | null) => void
}

export type PendingEventStore = ReturnType<typeof createPendingEventStore>

export function createPendingEventStore(deps: PendingEventStoreDeps) {
  const { kv, postEvent, isNetworkError } = deps
  const orderWrite = deps.orderWrite ?? (<T,>(_caseId: string, run: () => Promise<T>) => run())

  // Index mutations are serialized (same lost-update defense as the outbox:
  // the capture screen and the global flusher can both touch the index).
  const indexQueue = createSingleFlightQueue()

  async function loadIndex(): Promise<string[]> {
    const raw = await kv.get(PENDING_EVENTS_INDEX_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  async function storeIndex(ids: string[]): Promise<void> {
    const unique = [...new Set(ids)]
    if (unique.length === 0) {
      await kv.delete(PENDING_EVENTS_INDEX_KEY)
      return
    }
    await kv.set(PENDING_EVENTS_INDEX_KEY, JSON.stringify(unique))
  }

  /** Track which cases have pending events so a global flusher can replay them. */
  function markPendingCase(caseId: string, hasPending: boolean): Promise<void> {
    return indexQueue.enqueue(async () => {
      const ids = await loadIndex()
      const has = ids.includes(caseId)
      if (hasPending && !has) await storeIndex([...ids, caseId])
      else if (!hasPending && has) await storeIndex(ids.filter((id) => id !== caseId))
    })
  }

  async function loadPending<T extends PendingEvent = PendingEvent>(caseId: string): Promise<T[]> {
    const raw = await kv.get(pendingEventsKey(caseId))
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  async function totalPending(): Promise<number> {
    const ids = await loadIndex()
    let total = 0
    for (const id of ids) total += (await loadPending(id)).length
    return total
  }

  function notifyChanged(): void {
    if (!deps.onChange) return
    void totalPending()
      .then((n) => deps.onChange?.(n))
      .catch(() => {})
  }

  async function storePending<T extends PendingEvent>(caseId: string, events: T[]): Promise<void> {
    if (events.length === 0) {
      await kv.delete(pendingEventsKey(caseId))
    } else {
      await kv.set(pendingEventsKey(caseId), JSON.stringify(events))
    }
    await markPendingCase(caseId, events.length > 0)
    notifyChanged()
  }

  async function recordDropped(caseId: string, ev: PendingEvent, status: number): Promise<void> {
    try {
      const raw = await kv.get(DROPPED_EVENTS_KEY)
      const list = raw ? (JSON.parse(raw) as DroppedEvent[]) : []
      list.push({ caseId, event: serializeEventForServer(ev), status, droppedAt: new Date().toISOString() })
      await kv.set(DROPPED_EVENTS_KEY, JSON.stringify(list.slice(-200)))
    } catch {
      /* best-effort - never let logging a drop throw */
    }
  }

  /** Events the server permanently rejected (kept for visibility/recovery). */
  async function droppedEvents(): Promise<DroppedEvent[]> {
    const raw = await kv.get(DROPPED_EVENTS_KEY)
    if (!raw) return []
    try {
      const l = JSON.parse(raw)
      return Array.isArray(l) ? l : []
    } catch {
      return []
    }
  }

  async function clearAll(): Promise<number> {
    const ids = await loadIndex()
    await Promise.all(ids.map((id) => kv.delete(pendingEventsKey(id)).catch(() => {})))
    await kv.delete(PENDING_EVENTS_INDEX_KEY).catch(() => {})
    await kv.delete(DROPPED_EVENTS_KEY).catch(() => {})
    notifyChanged()
    return ids.length
  }

  /** Empty only the dropped-events log (the pending queue is untouched). */
  async function clearDropped(): Promise<void> {
    await kv.delete(DROPPED_EVENTS_KEY).catch(() => {})
  }

  async function flushCaseUnlocked(caseId: string): Promise<{ saved: number; failed: number }> {
    // Stored newest-first by the capture screen — replay oldest-first.
    const pending = (await loadPending(caseId)).slice().reverse()
    if (pending.length === 0) {
      await markPendingCase(caseId, false)
      return { saved: 0, failed: 0 }
    }

    let saved = 0
    let failed = 0
    const stillPending: PendingEvent[] = []
    let networkDown = false
    for (const ev of pending) {
      if (networkDown) {
        stillPending.push(ev)
        continue
      }
      try {
        let res = await postEvent(caseId, serializeEventForServer(ev), deps.getRevision?.(caseId))
        if (!res.ok && res.status === 409 && res.serverRevision != null) {
          deps.onAcknowledged?.(caseId, res.serverRevision)
          res = await postEvent(caseId, serializeEventForServer(ev), res.serverRevision)
        }
        if (res.ok) {
          deps.onAcknowledged?.(caseId, res.revision ?? null)
          saved += 1
          continue
        }
        if (res.status === 401) {
          // Auth expired — transient. Keep the event and stop hitting the
          // server for the rest of this batch.
          stillPending.push(ev)
          failed += 1
          networkDown = true
          continue
        }
        if (res.status === 409) {
          stillPending.push(ev)
          failed += 1
          networkDown = true
          continue
        }
        if (res.status >= 500) {
          stillPending.push(ev)
          failed += 1
          continue
        }
        // Permanent 4xx (400 invalid/PII, 403 finalised/forbidden, 404 gone) —
        // can never succeed; record it so it isn't silently lost, then drop it.
        await recordDropped(caseId, ev, res.status)
        failed += 1
      } catch (err) {
        stillPending.push(ev)
        failed += 1
        if (isNetworkError(err)) networkDown = true
      }
    }

    // Re-store remaining in newest-first order to match the capture convention.
    await storePending(caseId, stillPending.slice().reverse())
    return { saved, failed }
  }

  function flushCase(caseId: string): Promise<{ saved: number; failed: number }> {
    return orderWrite(caseId, () => flushCaseUnlocked(caseId))
  }

  /** Replay all persisted events across all cases. Safe to call repeatedly. */
  async function flushAll(): Promise<{ saved: number; failed: number }> {
    const ids = await loadIndex()
    if (ids.length === 0) return { saved: 0, failed: 0 }

    let saved = 0
    let failed = 0
    for (const caseId of ids) {
      const result = await flushCase(caseId)
      saved += result.saved
      failed += result.failed
    }
    return { saved, failed }
  }

  return {
    loadPending,
    totalPending,
    storePending,
    markPendingCase,
    droppedEvents,
    clearDropped,
    clearAll,
    flushCase,
    flushAll,
  }
}
