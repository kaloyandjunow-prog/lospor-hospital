import type { KVAdapter, SectionRevision } from "./protocol"
import { createSingleFlightQueue } from "./single-flight-queue"

export type EventMutation =
  | {
      operationId: string
      caseId: string
      kind: "event.upsert"
      eventId: string
      event: Record<string, unknown>
      baseRevision: SectionRevision
      queuedAt: string
    }
  | {
      operationId: string
      caseId: string
      kind: "event.delete"
      eventId: string
      baseRevision: SectionRevision
      queuedAt: string
    }

export type EventMutationResult = {
  ok: boolean
  status: number
  revision?: SectionRevision
  serverRevision?: SectionRevision
}

export type DroppedEventMutation = EventMutation & {
  droppedAt: string
  status: number
}

export type EventMutationJournalDeps = {
  kv: KVAdapter
  send: (operation: EventMutation, revision: SectionRevision) => Promise<EventMutationResult>
  isNetworkError: (error: unknown) => boolean
  orderWrite?: <T>(caseId: string, run: () => Promise<T>) => Promise<T>
  onAcknowledged?: (caseId: string, revision: SectionRevision) => void
  onChange?: (count: number) => void
}

export const EVENT_MUTATION_INDEX_KEY = "lospor_autosave_event_mutation_index_v1"
export const DROPPED_EVENT_MUTATIONS_KEY = "lospor_autosave_event_mutation_dropped_v1"

export function eventMutationKey(caseId: string): string {
  return `lospor_autosave_event_mutations_v1_${caseId}`
}

export function createEventMutationJournal(deps: EventMutationJournalDeps) {
  const orderWrite = deps.orderWrite ?? (<T,>(_caseId: string, run: () => Promise<T>) => run())
  const storageQueue = createSingleFlightQueue()

  async function loadIndex(): Promise<string[]> {
    const raw = await deps.kv.get(EVENT_MUTATION_INDEX_KEY)
    if (!raw) return []
    try {
      const value = JSON.parse(raw)
      return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []
    } catch {
      return []
    }
  }

  async function storeIndex(ids: string[]): Promise<void> {
    const unique = [...new Set(ids)]
    if (unique.length === 0) await deps.kv.delete(EVENT_MUTATION_INDEX_KEY)
    else await deps.kv.set(EVENT_MUTATION_INDEX_KEY, JSON.stringify(unique))
  }

  async function load(caseId: string): Promise<EventMutation[]> {
    const raw = await deps.kv.get(eventMutationKey(caseId))
    if (!raw) return []
    try {
      const value = JSON.parse(raw)
      return Array.isArray(value) ? value : []
    } catch {
      return []
    }
  }

  async function total(): Promise<number> {
    let count = 0
    for (const caseId of await loadIndex()) count += (await load(caseId)).length
    return count
  }

  function notify(): void {
    if (!deps.onChange) return
    void total().then((count) => deps.onChange?.(count)).catch(() => {})
  }

  function store(caseId: string, operations: EventMutation[]): Promise<void> {
    return storageQueue.enqueue(async () => {
      if (operations.length === 0) await deps.kv.delete(eventMutationKey(caseId))
      else await deps.kv.set(eventMutationKey(caseId), JSON.stringify(operations))
      const ids = await loadIndex()
      const next = operations.length > 0
        ? [...ids.filter((id) => id !== caseId), caseId]
        : ids.filter((id) => id !== caseId)
      await storeIndex(next)
      notify()
    })
  }

  async function stage(operation: EventMutation): Promise<void> {
    return storageQueue.enqueue(async () => {
      const current = await load(operation.caseId)
      // Only the final pending intent for one event matters. A new delete
      // supersedes an unsent edit; a new edit supersedes an unsent delete.
      const next = [
        ...current.filter((item) => item.eventId !== operation.eventId),
        operation,
      ]
      await deps.kv.set(eventMutationKey(operation.caseId), JSON.stringify(next))
      const ids = await loadIndex()
      if (!ids.includes(operation.caseId)) await storeIndex([...ids, operation.caseId])
      notify()
    })
  }

  async function removeAcknowledged(caseId: string, operationId: string): Promise<void> {
    const current = await load(caseId)
    await store(caseId, current.filter((item) => item.operationId !== operationId))
  }

  async function replaceRevision(
    caseId: string,
    operationId: string,
    revision: SectionRevision,
  ): Promise<void> {
    const current = await load(caseId)
    await store(caseId, current.map((item) =>
      item.operationId === operationId ? { ...item, baseRevision: revision } : item
    ))
  }

  async function recordDropped(operation: EventMutation, status: number): Promise<void> {
    try {
      const raw = await deps.kv.get(DROPPED_EVENT_MUTATIONS_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      const current: DroppedEventMutation[] = Array.isArray(parsed) ? parsed : []
      current.push({ ...operation, status, droppedAt: new Date().toISOString() })
      await deps.kv.set(DROPPED_EVENT_MUTATIONS_KEY, JSON.stringify(current.slice(-200)))
    } catch {
      // Diagnostics must never block charting.
    }
  }

  async function flushCaseUnlocked(caseId: string): Promise<{ saved: number; failed: number; dropped: number }> {
    const snapshot = await load(caseId)
    let saved = 0
    let failed = 0
    let dropped = 0

    for (const operation of snapshot) {
      let revision = operation.baseRevision
      try {
        let result = await deps.send(operation, revision)
        if (!result.ok && result.status === 409 && result.serverRevision != null) {
          revision = result.serverRevision
          await replaceRevision(caseId, operation.operationId, revision)
          result = await deps.send(operation, revision)
        }
        if (result.ok) {
          await removeAcknowledged(caseId, operation.operationId)
          deps.onAcknowledged?.(caseId, result.revision ?? revision)
          saved += 1
          continue
        }
        if (result.status === 400 || result.status === 403 || result.status === 404) {
          await recordDropped(operation, result.status)
          await removeAcknowledged(caseId, operation.operationId)
          dropped += 1
          continue
        }
        failed += 1
        if (result.status === 401 || result.status === 409) break
      } catch (error) {
        failed += 1
        if (deps.isNetworkError(error)) break
      }
    }
    return { saved, failed, dropped }
  }

  function flushCase(caseId: string) {
    return orderWrite(caseId, () => flushCaseUnlocked(caseId))
  }

  async function flushAll(): Promise<{ saved: number; failed: number; dropped: number }> {
    let saved = 0
    let failed = 0
    let dropped = 0
    for (const caseId of await loadIndex()) {
      const result = await flushCase(caseId)
      saved += result.saved
      failed += result.failed
      dropped += result.dropped
    }
    return { saved, failed, dropped }
  }

  async function clearAll(): Promise<number> {
    const ids = await loadIndex()
    await Promise.all(ids.map((caseId) => deps.kv.delete(eventMutationKey(caseId)).catch(() => {})))
    await deps.kv.delete(EVENT_MUTATION_INDEX_KEY).catch(() => {})
    await deps.kv.delete(DROPPED_EVENT_MUTATIONS_KEY).catch(() => {})
    notify()
    return ids.length
  }

  async function clearCase(caseId: string): Promise<void> {
    await store(caseId, [])
  }

  return { stage, load, total, flushCase, flushAll, clearCase, clearAll }
}
