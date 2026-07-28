import {
  createCaseOutbox,
  type BaseUpdatedAtInput,
  type CaseOutbox,
  type CasePatchOutcome,
  type CasePatchResult,
  type OutboxDeps,
} from "./outbox"
import {
  createPendingEventStore,
  prependPendingEvent,
  type PendingEvent,
  type PendingEventStore,
  type PendingEventStoreDeps,
} from "./pending-events"
import {
  createEventMutationJournal,
  type EventMutation,
  type EventMutationJournalDeps,
} from "./event-mutation-journal"
import { createCaseWriteQueue } from "./case-write-queue"
import { createSectionSnapshotStore } from "./field-diff"
import {
  responseRevision,
  type BlockedSaveIssue,
  type CaseSection,
  type SectionRevision,
  type SyncStatus,
} from "./protocol"

export type AutosaveManagerState = {
  caseId: string
  status: SyncStatus
  pending: number
  lastSavedAt: string | null
  error: string | null
  blocked: BlockedSaveIssue | null
}

export type AutosaveManagerDeps = {
  outbox: Omit<OutboxDeps, "orderWrite">
  pendingEvents: Omit<PendingEventStoreDeps, "orderWrite">
  eventMutations: Omit<EventMutationJournalDeps, "orderWrite">
  now?: () => Date
}

export type SaveSectionOptions = {
  fullPayload?: Record<string, unknown>
  force?: boolean
  partial?: boolean
}

const EMPTY_STATE = (caseId: string): AutosaveManagerState => ({
  caseId,
  status: "idle",
  pending: 0,
  lastSavedAt: null,
  error: null,
  blocked: null,
})

/**
 * One save coordinator per app runtime. Screens submit clinical intent; this
 * manager owns durable-first storage, per-case ordering, revisions, replay,
 * snapshots, and status notifications.
 */
export function createAutosaveManager(deps: AutosaveManagerDeps) {
  const now = deps.now ?? (() => new Date())
  const queue = createCaseWriteQueue()
  const snapshots = createSectionSnapshotStore()
  const revisions = new Map<string, SectionRevision>()
  const states = new Map<string, AutosaveManagerState>()
  const listeners = new Set<(state: AutosaveManagerState) => void>()

  const key = (caseId: string, section: CaseSection) => `${caseId}:${section}`
  const revisionFor = (caseId: string, section: CaseSection) => revisions.get(key(caseId, section)) ?? null

  function emit(caseId: string, patch: Partial<AutosaveManagerState>): void {
    const next = { ...(states.get(caseId) ?? EMPTY_STATE(caseId)), ...patch, caseId }
    states.set(caseId, next)
    for (const listener of listeners) {
      try { listener(next) } catch { /* a bad UI subscriber cannot break saving */ }
    }
  }

  function setRevision(caseId: string, section: CaseSection, revision: SectionRevision): void {
    if (revision == null) return
    const current = revisions.get(key(caseId, section))
    // Once a v5.6 integer revision is known, a legacy timestamp ref held by an
    // older screen adapter must not downgrade it.
    if (typeof current === "number" && typeof revision === "string") return
    revisions.set(key(caseId, section), revision)
  }

  function acknowledgeEvent(caseId: string, revision: SectionRevision): void {
    setRevision(caseId, "intraop", revision)
  }

  const outbox: CaseOutbox = createCaseOutbox({
    ...deps.outbox,
    orderWrite: (caseId, _section, run) => queue.enqueue(caseId, run),
  })
  const pendingEvents: PendingEventStore = createPendingEventStore({
    ...deps.pendingEvents,
    getRevision: (caseId) => revisionFor(caseId, "intraop"),
    orderWrite: (caseId, run) => queue.enqueue(caseId, run),
    onAcknowledged: acknowledgeEvent,
  })
  const eventMutations = createEventMutationJournal({
    ...deps.eventMutations,
    orderWrite: (caseId, run) => queue.enqueue(caseId, run),
    onAcknowledged: acknowledgeEvent,
  })

  function hydrateSection(
    caseId: string,
    section: CaseSection,
    payload: Record<string, unknown>,
    revision: SectionRevision,
  ): void {
    snapshots.confirm(caseId, section, payload)
    setRevision(caseId, section, revision)
  }

  async function refreshPending(caseId: string): Promise<number> {
    const patchCount = (await outbox.summary()).entries.filter((entry) => entry.caseId === caseId).length
    const eventCount = (await pendingEvents.loadPending(caseId)).length
    const mutationCount = (await eventMutations.load(caseId)).length
    const pending = patchCount + eventCount + mutationCount
    emit(caseId, { pending })
    return pending
  }

  async function saveSection(
    caseId: string,
    section: CaseSection,
    payload: Record<string, unknown>,
    options: SaveSectionOptions = {},
  ): Promise<CasePatchOutcome> {
    const fullPayload = options.fullPayload ?? payload
    const body = options.partial || options.force ? payload : snapshots.diff(caseId, section, fullPayload)
    if (!body) {
      const existingBlock = await outbox.blockedIssue(caseId)
      emit(caseId, {
        status: existingBlock ? "blocked" : "saved",
        error: existingBlock?.message ?? null,
        blocked: existingBlock,
        lastSavedAt: existingBlock ? states.get(caseId)?.lastSavedAt ?? null : now().toISOString(),
      })
      if (existingBlock) return { result: "blocked", blocked: existingBlock }
      return { result: "saved" }
    }

    // Durable first: the operation is recoverable before any network request.
    await outbox.queue(caseId, section, body, revisionFor(caseId, section) as BaseUpdatedAtInput)
    emit(caseId, { status: "queued", pending: await refreshPending(caseId), error: null, blocked: null })

    const result = await outbox.flushOne(caseId, section)
    if (result.result === "saved") {
      if (result.response) setRevision(caseId, section, responseRevision(section, result.response))
      if (options.partial) snapshots.merge(caseId, section, payload)
      else snapshots.confirm(caseId, section, fullPayload)
      const remainingBlock = await outbox.blockedIssue(caseId)
      const pending = await refreshPending(caseId)
      emit(caseId, {
        status: remainingBlock ? "blocked" : pending > 0 ? "queued" : "saved",
        pending,
        lastSavedAt: now().toISOString(),
        error: remainingBlock?.message ?? null,
        blocked: remainingBlock,
      })
    } else if (result.result === "blocked" && result.blocked) {
      if (result.response) setRevision(caseId, section, responseRevision(section, result.response))
      if (result.savedPayload) snapshots.merge(caseId, section, result.savedPayload)
      emit(caseId, {
        status: "blocked",
        pending: await refreshPending(caseId),
        lastSavedAt: result.response ? now().toISOString() : states.get(caseId)?.lastSavedAt ?? null,
        error: result.blocked.message,
        blocked: result.blocked,
      })
    } else {
      const pending = await refreshPending(caseId)
      const remainingBlock = await outbox.blockedIssue(caseId)
      const effectiveResult: CasePatchResult =
        result.result === "failed" && pending > 0 ? "queued" : result.result
      emit(caseId, {
        status: remainingBlock ? "blocked" : effectiveResult === "queued" ? "queued" : "failed",
        pending,
        error: remainingBlock?.message ?? (effectiveResult === "failed" ? "Save failed" : null),
        blocked: remainingBlock,
      })
      if (effectiveResult !== result.result) return { result: effectiveResult }
    }
    return result
  }

  async function flushIntraopBeforeEvents(caseId: string): Promise<boolean> {
    const result = await outbox.flushOne(caseId, "intraop")
    if (result.result === "saved" && result.response) {
      setRevision(caseId, "intraop", responseRevision("intraop", result.response))
    } else if (result.result === "blocked") {
      if (result.response) {
        setRevision(caseId, "intraop", responseRevision("intraop", result.response))
      }
      if (result.savedPayload) snapshots.merge(caseId, "intraop", result.savedPayload)
    }
    return result.result === "empty" || result.result === "saved" || result.result === "blocked"
  }

  async function appendEvent<T extends PendingEvent>(caseId: string, event: T): Promise<void> {
    const current = await pendingEvents.loadPending<T>(caseId)
    await pendingEvents.storePending(caseId, prependPendingEvent(current, event))
    emit(caseId, { status: "queued", pending: await refreshPending(caseId), error: null })
    if (!await flushIntraopBeforeEvents(caseId)) {
      emit(caseId, {
        status: "queued",
        pending: await refreshPending(caseId),
        error: null,
      })
      return
    }
    const result = await pendingEvents.flushCase(caseId)
    const pending = await refreshPending(caseId)
    const existingBlock = await outbox.blockedIssue(caseId)
    emit(caseId, {
      status: existingBlock ? "blocked" : result.failed > 0 ? "failed" : pending > 0 ? "queued" : "saved",
      pending,
      lastSavedAt: result.saved > 0 ? now().toISOString() : states.get(caseId)?.lastSavedAt ?? null,
      error: existingBlock?.message ?? (result.failed > 0 ? "Event save failed" : null),
    })
  }

  async function stageEventMutation(operation: EventMutation): Promise<void> {
    await eventMutations.stage({
      ...operation,
      baseRevision: revisionFor(operation.caseId, "intraop") ?? operation.baseRevision,
    })
    emit(operation.caseId, { status: "queued", pending: await refreshPending(operation.caseId), error: null })
    if (!await flushIntraopBeforeEvents(operation.caseId)) {
      emit(operation.caseId, {
        status: "queued",
        pending: await refreshPending(operation.caseId),
        error: null,
      })
      return
    }
    const result = await eventMutations.flushCase(operation.caseId)
    const pending = await refreshPending(operation.caseId)
    const existingBlock = await outbox.blockedIssue(operation.caseId)
    emit(operation.caseId, {
      status: existingBlock ? "blocked" : result.failed > 0 ? "failed" : pending > 0 ? "queued" : "saved",
      pending,
      lastSavedAt: result.saved > 0 ? now().toISOString() : states.get(operation.caseId)?.lastSavedAt ?? null,
      error: existingBlock?.message ?? (result.failed > 0 ? "Event change failed" : null),
    })
  }

  async function flushCase(caseId: string): Promise<void> {
    emit(caseId, { status: "saving", error: null, blocked: null })
    let blocked: BlockedSaveIssue | null = null
    let eventsReady = true
    for (const section of ["preop", "intraop", "postop"] as const) {
      const result = await outbox.flushOne(caseId, section)
      if (result.result === "saved" && result.response) {
        setRevision(caseId, section, responseRevision(section, result.response))
      } else if (result.result === "blocked" && result.blocked) {
        blocked ??= result.blocked
        if (result.response) setRevision(caseId, section, responseRevision(section, result.response))
        if (result.savedPayload) snapshots.merge(caseId, section, result.savedPayload)
      }
      if (
        section === "intraop" &&
        result.result !== "empty" &&
        result.result !== "saved" &&
        result.result !== "blocked"
      ) {
        eventsReady = false
      }
    }
    const events = eventsReady
      ? await pendingEvents.flushCase(caseId)
      : { saved: 0, failed: 0 }
    const mutations = eventsReady
      ? await eventMutations.flushCase(caseId)
      : { saved: 0, failed: 0 }
    const pending = await refreshPending(caseId)
    const failed = events.failed + mutations.failed
    emit(caseId, {
      status: blocked ? "blocked" : failed > 0 ? "failed" : pending > 0 ? "queued" : "saved",
      pending,
      lastSavedAt: failed === 0 && !blocked && pending === 0 ? now().toISOString() : states.get(caseId)?.lastSavedAt ?? null,
      error: blocked?.message ?? (failed > 0 ? "Some changes are still waiting" : null),
      blocked,
    })
  }

  async function flushAll(): Promise<void> {
    await outbox.reconcile()
    const caseIds = new Set<string>((await outbox.summary()).entries.map((entry) => entry.caseId))
    for (const id of await deps.pendingEvents.kv.get("lospor_pending_intraop_index").then((raw) => {
      if (!raw) return [] as string[]
      try { const value = JSON.parse(raw); return Array.isArray(value) ? value : [] } catch { return [] as string[] }
    }).catch(() => [])) caseIds.add(id)
    for (const id of await deps.eventMutations.kv.get("lospor_autosave_event_mutation_index_v1").then((raw) => {
      if (!raw) return [] as string[]
      try { const value = JSON.parse(raw); return Array.isArray(value) ? value : [] } catch { return [] as string[] }
    }).catch(() => [])) caseIds.add(id)
    for (const caseId of caseIds) await flushCase(caseId)
  }

  return {
    hydrateSection,
    setRevision,
    getRevision: revisionFor,
    getState: (caseId: string) => states.get(caseId) ?? EMPTY_STATE(caseId),
    subscribe(listener: (state: AutosaveManagerState) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    saveSection,
    appendEvent,
    stageEventMutation,
    flushCase,
    flushAll,
    waitForCase: (caseId: string) => queue.idle(caseId),
    runExclusive: <T>(caseId: string, operation: () => Promise<T>) => queue.enqueue(caseId, operation),
    clearQueues: () => queue.clear(),
    clearCase(caseId: string) {
      snapshots.clear(caseId)
      for (const section of ["preop", "intraop", "postop"] as const) revisions.delete(key(caseId, section))
      states.delete(caseId)
    },
    async discardCase(caseId: string): Promise<void> {
      snapshots.clear(caseId)
      for (const section of ["preop", "intraop", "postop"] as const) revisions.delete(key(caseId, section))
      states.delete(caseId)
      await Promise.all([
        outbox.clearAllForCase(caseId),
        pendingEvents.storePending(caseId, []),
        eventMutations.clearCase(caseId),
      ])
    },
    outbox,
    pendingEvents,
    eventMutations,
  }
}
