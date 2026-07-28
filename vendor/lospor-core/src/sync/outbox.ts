// The offline tray ("outbox"): section patches that could not reach the
// server are persisted locally and replayed later. Ported from
// lospor-mobile/src/lib/offline-case-patches.ts (v4.1.x) with storage
// (KVAdapter) and transport injected so web and mobile share one
// implementation — including all its defenses:
//
//  - data written BEFORE the index (a crash leaves a repairable orphan,
//    never an index entry with no data), with reconcile() at startup
//  - merge-on-queue: re-queueing a section lays newer fields over the queued
//    ones (latest value per field wins), and keeps the ORIGINAL base
//    timestamp so conflict detection still compares against what the user
//    actually saw
//  - flush discards permanently-rejected patches (404/403: case deleted or
//    access revoked) instead of retrying forever, keeps everything else
//
// STORAGE KEYS are identical to the historical mobile keys so devices with
// queued data survive the upgrade without losing their tray.

import {
  blockedSaveValueChanged,
  captureBlockedSaveValues,
  responseRevision,
  type BlockedSaveIssue,
  type CasePatchResponse,
  type CaseSection,
  type KVAdapter,
  type SectionRevision,
} from "./protocol"
import { createSingleFlightQueue } from "./single-flight-queue"

export type CasePatchResult = "saved" | "queued" | "blocked" | "empty" | "failed"
export type CasePatchOutcome = {
  result: CasePatchResult
  response?: CasePatchResponse
  blocked?: BlockedSaveIssue
  savedPayload?: Record<string, unknown>
}

/**
 * The conflict base may be a concrete timestamp or a thunk. A thunk is
 * resolved INSIDE the queued operation, right before the request goes out —
 * so a save that waited behind another write reads the freshest base instead
 * of the one captured when it was submitted (rapid successive saves would
 * otherwise carry a stale base and 409 against their own predecessor).
 */
export type BaseUpdatedAtInput = SectionRevision | undefined | (() => SectionRevision | undefined)

function resolveBase(base: BaseUpdatedAtInput): SectionRevision | undefined {
  return typeof base === "function" ? base() : base
}

export type OutboxEntry = { caseId: string; section: CaseSection }
export type OutboxSummary = { count: number; entries: OutboxEntry[] }

/** How a failed send should be treated by the outbox. */
export type PatchFailure =
  | { kind: "network" } // no connectivity — queue/keep the patch
  // Server answered with an error status. For a 409 the classifier SHOULD
  // include the server's current timestamp (serverVersion.updatedAt) so the
  // flush can self-heal once instead of replaying the stale base forever.
  | {
      kind: "http"
      status: number
      serverUpdatedAt?: string
      serverRevision?: SectionRevision
      blocked?: BlockedSaveIssue
      message?: string
    }
  | { kind: "other" } // anything else — keep the patch, report failed

export type OutboxDeps = {
  kv: KVAdapter
  /** Perform the actual PATCH. May throw; classifyError maps the throw. */
  sendPatch: (
    caseId: string,
    section: CaseSection,
    payload: unknown,
    baseUpdatedAt: SectionRevision | undefined,
  ) => Promise<CasePatchResponse>
  /** Map a thrown error from sendPatch to outbox semantics. */
  classifyError: (err: unknown) => PatchFailure
  /**
   * Optional write-ordering hook (per-case single-flight queue). Defaults to
   * immediate execution. Historically mobile only ordered intraop patches.
   */
  orderWrite?: <T>(caseId: string, section: CaseSection, run: () => Promise<T>) => Promise<T>
  /**
   * Best-effort notification after any mutation of the tray (queue, clear,
   * successful save/flush) with the fresh summary — lets UI badges track the
   * queued count live instead of polling. Never awaited, errors swallowed.
   */
  onChange?: (summary: OutboxSummary) => void
}

export const OUTBOX_INDEX_KEY = "lospor_pending_case_patches"

// v5.1: patches moved to their own key namespace. The historical key
// `lospor_pending_${section}_${caseId}` COLLIDED with the pending-events
// journal for section "intraop" (`lospor_pending_intraop_${caseId}`): a
// queued intraop section patch and queued intraop events for the same case
// silently overwrote each other, and a patch flush could destroy queued
// events. reconcile() migrates legacy entries on startup.
export function outboxPatchKey(caseId: string, section: CaseSection): string {
  return `lospor_patchq_${section}_${caseId}`
}

export function legacyOutboxPatchKey(caseId: string, section: CaseSection): string {
  return `lospor_pending_${section}_${caseId}`
}

const ALL_SECTIONS: readonly CaseSection[] = ["preop", "postop", "intraop"]

type StoredBlockedChange = {
  issue: BlockedSaveIssue
  values: Record<string, unknown>
}

type StoredPatch = {
  payload?: unknown
  baseUpdatedAt?: SectionRevision
  queuedAt?: string
  blocked?: StoredBlockedChange[]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

function hasKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0
}

function quarantine(
  payload: Record<string, unknown>,
  issue: BlockedSaveIssue,
): { remaining: Record<string, unknown>; blocked: StoredBlockedChange } {
  const remaining = { ...payload }
  const values = captureBlockedSaveValues(issue, payload)
  for (const blockedKey of issue.blockedKeys) {
    delete remaining[blockedKey]
  }
  // A malformed or old response must still stop a permanent retry loop.
  if (Object.keys(values).length === 0) {
    Object.assign(values, payload)
    for (const key of Object.keys(remaining)) delete remaining[key]
  }
  return { remaining, blocked: { issue, values } }
}

export type CaseOutbox = ReturnType<typeof createCaseOutbox>

export function createCaseOutbox(deps: OutboxDeps) {
  const { kv, sendPatch, classifyError } = deps
  const orderWrite = deps.orderWrite ?? (<T,>(_caseId: string, _section: CaseSection, run: () => Promise<T>) => run())

  // All index mutations are serialized through one queue: the historical
  // mobile implementation let parallel flushes read-modify-write the index
  // concurrently, which could silently lose a removal (lost-update race).
  const indexQueue = createSingleFlightQueue()

  function notifyChanged(): void {
    if (!deps.onChange) return
    void summary()
      .then((s) => deps.onChange?.(s))
      .catch(() => {})
  }

  async function loadIndex(): Promise<OutboxEntry[]> {
    const raw = await kv.get(OUTBOX_INDEX_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  async function storeIndex(entries: OutboxEntry[]): Promise<void> {
    if (entries.length === 0) {
      await kv.delete(OUTBOX_INDEX_KEY)
      return
    }
    await kv.set(OUTBOX_INDEX_KEY, JSON.stringify(entries))
  }

  function addIndexEntry(caseId: string, section: CaseSection): Promise<void> {
    return indexQueue.enqueue(async () => {
      const entries = await loadIndex()
      if (entries.some((entry) => entry.caseId === caseId && entry.section === section)) return
      await storeIndex([...entries, { caseId, section }])
    })
  }

  function removeIndexEntry(caseId: string, section: CaseSection): Promise<void> {
    return indexQueue.enqueue(async () => {
      const entries = await loadIndex()
      await storeIndex(entries.filter((entry) => entry.caseId !== caseId || entry.section !== section))
    })
  }

  async function summary(): Promise<OutboxSummary> {
    const entries = await loadIndex()
    return { count: entries.length, entries }
  }

  async function queuedCaseIds(): Promise<string[]> {
    const entries = await loadIndex()
    return [...new Set(entries.map((e) => e.caseId))]
  }

  async function clearAll(): Promise<number> {
    const entries = await loadIndex()
    await Promise.all(entries.map((e) => kv.delete(outboxPatchKey(e.caseId, e.section)).catch(() => {})))
    await kv.delete(OUTBOX_INDEX_KEY).catch(() => {})
    notifyChanged()
    return entries.length
  }

  async function queue(
    caseId: string,
    section: CaseSection,
    payload: unknown,
    baseUpdatedAtInput?: BaseUpdatedAtInput,
  ): Promise<void> {
    // Stored patches need a concrete base — resolve any thunk at queue time.
    const baseUpdatedAt = resolveBase(baseUpdatedAtInput)
    // Write patch data BEFORE updating the index so a crash between the two
    // leaves a repairable orphan rather than an index entry with no data.
    const key = outboxPatchKey(caseId, section)
    const existingRaw = await kv.get(key).catch(() => null)
    let nextPayload = payload
    let nextBaseUpdatedAt = baseUpdatedAt
    let nextBlocked: StoredBlockedChange[] = []
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw) as StoredPatch
        nextBlocked = Array.isArray(existing.blocked) ? existing.blocked : []
        if (payload && typeof payload === "object" && !Array.isArray(payload) && nextBlocked.length > 0) {
          const incoming = { ...(payload as Record<string, unknown>) }
          nextBlocked = nextBlocked.filter((blocked) => {
            const changed = blockedSaveValueChanged(blocked.issue, blocked.values, incoming)
            if (changed) return false
            for (const blockedKey of blocked.issue.blockedKeys) delete incoming[blockedKey]
            return true
          })
          nextPayload = incoming
        }
        if (
          nextPayload &&
          existing.payload &&
          typeof nextPayload === "object" &&
          typeof existing.payload === "object" &&
          !Array.isArray(nextPayload) &&
          !Array.isArray(existing.payload)
        ) {
          nextPayload = {
            ...(existing.payload as Record<string, unknown>),
            ...(nextPayload as Record<string, unknown>),
          }
        }
        nextBaseUpdatedAt = existing.baseUpdatedAt ?? baseUpdatedAt
      } catch {
        nextPayload = payload
      }
    }
    await kv.set(key, JSON.stringify({
      payload: nextPayload,
      baseUpdatedAt: nextBaseUpdatedAt,
      queuedAt: new Date().toISOString(),
      ...(nextBlocked.length > 0 ? { blocked: nextBlocked } : {}),
    }))
    await addIndexEntry(caseId, section)
    notifyChanged()
  }

  /**
   * Reconcile the index against actual storage contents. Call once at app
   * startup so a crash mid-write cannot leave the queue permanently
   * inconsistent. See the mobile original for the two repair cases.
   */
  async function reconcile(): Promise<void> {
    await indexQueue.enqueue(reconcileUnlocked)
    notifyChanged()
  }

  /**
   * Move a patch stored under the legacy `lospor_pending_*` key to the new
   * namespace. Shape-checked: an ARRAY under the intraop legacy key is the
   * pending-events journal (the historical collision) and is left alone.
   */
  async function migrateLegacyKey(caseId: string, section: CaseSection): Promise<void> {
    const legacyKey = legacyOutboxPatchKey(caseId, section)
    const legacy = await kv.get(legacyKey).catch(() => null)
    if (!legacy) return
    try {
      const parsed = JSON.parse(legacy)
      if (Array.isArray(parsed)) return // pending-events journal — not ours
      if (!parsed || typeof parsed !== "object" || !("payload" in parsed)) return
    } catch {
      return
    }
    const existing = await kv.get(outboxPatchKey(caseId, section)).catch(() => null)
    if (!existing) await kv.set(outboxPatchKey(caseId, section), legacy)
    await kv.delete(legacyKey).catch(() => {})
  }

  async function reconcileUnlocked(): Promise<void> {
    // Preferred path: enumerate actual storage. This rediscovers patches for
    // caseIds the index has completely lost (e.g. a multi-tab lost-update on
    // the index) — the candidate walk below can only find orphans for
    // caseIds it already knows about. SecureStore can't enumerate, so mobile
    // falls through to the candidate walk.
    if (kv.keys) {
      try {
        // Migrate any legacy-key patches first (shape-checked, see above).
        const legacyKeys = await kv.keys("lospor_pending_")
        for (const key of legacyKeys) {
          for (const section of ALL_SECTIONS) {
            const prefix = `lospor_pending_${section}_`
            if (key.startsWith(prefix)) {
              await migrateLegacyKey(key.slice(prefix.length), section)
              break
            }
          }
        }
        const keys = await kv.keys("lospor_patchq_")
        const found: OutboxEntry[] = []
        for (const key of keys) {
          for (const section of ALL_SECTIONS) {
            const prefix = `lospor_patchq_${section}_`
            if (key.startsWith(prefix)) {
              found.push({ caseId: key.slice(prefix.length), section })
              break
            }
          }
        }
        await storeIndex(found)
        return
      } catch {
        /* enumeration failed — fall through to the candidate walk */
      }
    }

    const entries = await loadIndex()

    const candidates = new Map<string, OutboxEntry>()
    for (const entry of entries) {
      candidates.set(`${entry.caseId}:${entry.section}`, entry)
    }
    // Derive candidate keys across all sections for every known caseId so we
    // catch the "data written, index not written" crash case.
    const caseIds = [...new Set(entries.map((e) => e.caseId))]
    for (const caseId of caseIds) {
      for (const section of ALL_SECTIONS) {
        const key = `${caseId}:${section}`
        if (!candidates.has(key)) candidates.set(key, { caseId, section })
      }
    }

    const candidateList = [...candidates.values()]
    // Migrate any legacy-key patches for known candidates (non-enumerating
    // storage can only migrate what the index remembers).
    for (const entry of candidateList) {
      await migrateLegacyKey(entry.caseId, entry.section)
    }
    const results = await Promise.all(
      candidateList.map((entry) => kv.get(outboxPatchKey(entry.caseId, entry.section)).catch(() => null)),
    )
    await storeIndex(candidateList.filter((_, i) => results[i] !== null))
  }

  async function clearOne(caseId: string, section: CaseSection): Promise<void> {
    await kv.delete(outboxPatchKey(caseId, section))
    await removeIndexEntry(caseId, section)
    notifyChanged()
  }

  async function storePatch(caseId: string, section: CaseSection, patch: StoredPatch): Promise<void> {
    await kv.set(outboxPatchKey(caseId, section), JSON.stringify(patch))
    await addIndexEntry(caseId, section)
    notifyChanged()
  }

  async function storeBlockedOnly(
    caseId: string,
    section: CaseSection,
    blocked: StoredBlockedChange[],
    baseUpdatedAt: SectionRevision | undefined,
  ): Promise<void> {
    await storePatch(caseId, section, {
      payload: {},
      baseUpdatedAt,
      queuedAt: new Date().toISOString(),
      blocked,
    })
  }

  /** Remove all queued patches for a case (call after the case is deleted). */
  async function clearAllForCase(caseId: string): Promise<void> {
    await indexQueue.enqueue(async () => {
      const entries = await loadIndex()
      const forCase = entries.filter((e) => e.caseId === caseId)
      await Promise.all(forCase.map((e) => kv.delete(outboxPatchKey(e.caseId, e.section))))
      await storeIndex(entries.filter((e) => e.caseId !== caseId))
    })
    notifyChanged()
  }

  async function load<T = unknown>(caseId: string, section: CaseSection): Promise<T | null> {
    const raw = await kv.get(outboxPatchKey(caseId, section))
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as StoredPatch
      const payload = asRecord(parsed?.payload)
      for (const blocked of parsed?.blocked ?? []) Object.assign(payload, blocked.values)
      return (hasKeys(payload) ? payload : null) as T | null
    } catch {
      return null
    }
  }

  async function blockedIssue(caseId: string): Promise<BlockedSaveIssue | null> {
    for (const section of ALL_SECTIONS) {
      const raw = await kv.get(outboxPatchKey(caseId, section)).catch(() => null)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as StoredPatch
        const issue = parsed.blocked?.[0]?.issue
        if (issue) return issue
      } catch {
        // Reconciliation owns malformed-entry cleanup.
      }
    }
    return null
  }

  function sendInOrder(
    caseId: string,
    section: CaseSection,
    payload: unknown,
    baseUpdatedAt: BaseUpdatedAtInput,
  ): Promise<CasePatchResponse> {
    // The thunk (if any) resolves inside the queued run — freshest base wins.
    return orderWrite(caseId, section, () => sendPatch(caseId, section, payload, resolveBase(baseUpdatedAt)))
  }

  /** Try to save now; on a network failure, queue for later instead of losing the data. */
  async function save(
    caseId: string,
    section: CaseSection,
    payload: unknown,
    baseUpdatedAt?: BaseUpdatedAtInput,
  ): Promise<CasePatchOutcome> {
    try {
      const response = await sendInOrder(caseId, section, payload, baseUpdatedAt)
      await clearOne(caseId, section)
      return { result: "saved", response }
    } catch (err) {
      if (classifyError(err).kind === "network") {
        await queue(caseId, section, payload, baseUpdatedAt)
        return { result: "queued" }
      }
      throw err
    }
  }

  async function flushOne(
    caseId: string,
    section: CaseSection,
  ): Promise<CasePatchOutcome> {
    const raw = await kv.get(outboxPatchKey(caseId, section))
    if (!raw) return { result: "empty" }
    let parsed: StoredPatch
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { result: "empty" }
    }
    const blocked = Array.isArray(parsed.blocked) ? parsed.blocked : []
    let sendable = asRecord(parsed.payload)
    if (!hasKeys(sendable)) {
      return blocked.length > 0
        ? { result: "blocked", blocked: blocked[0].issue }
        : { result: "empty" }
    }

    // Quarantine permanent field failures, then retry only the safe remainder.
    const maxAttempts = Object.keys(sendable).length + 1
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await sendInOrder(caseId, section, sendable, parsed.baseUpdatedAt)
        if (blocked.length === 0) {
          await clearOne(caseId, section)
          return { result: "saved", response }
        }
        await storeBlockedOnly(caseId, section, blocked, responseRevision(section, response))
        return {
          result: "blocked",
          response,
          blocked: blocked[0].issue,
          savedPayload: sendable,
        }
      } catch (err) {
        const failure = classifyError(err)
        if (failure.kind === "http" && failure.blocked) {
          const quarantined = quarantine(sendable, failure.blocked)
          blocked.push(quarantined.blocked)
          sendable = quarantined.remaining
          if (!hasKeys(sendable)) {
            await storeBlockedOnly(caseId, section, blocked, parsed.baseUpdatedAt)
            return { result: "blocked", blocked: blocked[0].issue }
          }
          continue
        }
        if (failure.kind === "http" && (failure.status === 404 || failure.status === 403)) {
          await clearOne(caseId, section)
          return { result: "empty" }
        }
        const conflictBase = failure.kind === "http"
          ? (failure.serverRevision ?? failure.serverUpdatedAt)
          : null
        if (failure.kind === "http" && failure.status === 409 && conflictBase != null) {
          parsed.baseUpdatedAt = conflictBase
          try {
            const response = await sendInOrder(caseId, section, sendable, conflictBase)
            if (blocked.length === 0) {
              await clearOne(caseId, section)
              return { result: "saved", response }
            }
            await storeBlockedOnly(caseId, section, blocked, responseRevision(section, response))
            return {
              result: "blocked",
              response,
              blocked: blocked[0].issue,
              savedPayload: sendable,
            }
          } catch (retryError) {
            const retryFailure = classifyError(retryError)
            if (retryFailure.kind === "http" && retryFailure.blocked) {
              const quarantined = quarantine(sendable, retryFailure.blocked)
              blocked.push(quarantined.blocked)
              sendable = quarantined.remaining
              if (!hasKeys(sendable)) {
                await storeBlockedOnly(caseId, section, blocked, conflictBase)
                return { result: "blocked", blocked: blocked[0].issue }
              }
              continue
            }
            await storePatch(caseId, section, {
              ...parsed,
              payload: sendable,
              baseUpdatedAt: conflictBase,
              blocked,
            })
            return { result: "failed" }
          }
        }
        await storePatch(caseId, section, { ...parsed, payload: sendable, blocked })
        return { result: "failed" }
      }
    }
    await storePatch(caseId, section, { ...parsed, payload: sendable, blocked })
    return { result: blocked.length > 0 ? "blocked" : "failed", blocked: blocked[0]?.issue }
  }

  async function flushAll(): Promise<{ saved: number; failed: number; discarded: number }> {
    const entries = await loadIndex()
    if (entries.length === 0) return { saved: 0, failed: 0, discarded: 0 }

    const byCaseId = new Map<string, OutboxEntry[]>()
    for (const entry of entries) {
      const arr = byCaseId.get(entry.caseId) ?? []
      arr.push(entry)
      byCaseId.set(entry.caseId, arr)
    }

    let saved = 0
    let failed = 0
    let discarded = 0
    // "empty" during a flush means the patch was dropped (stale 404/403 or no
    // data) — a discard, not a successful save.
    const tally = (result: CasePatchResult) => {
      if (result === "saved") saved += 1
      else if (result === "empty") discarded += 1
      else failed += 1
    }
    await Promise.all(
      [...byCaseId.values()].map(async (caseEntries) => {
        // Sections of one case flush sequentially to respect ordering; cases
        // flush in parallel.
        for (const entry of caseEntries) {
          const result = await flushOne(entry.caseId, entry.section)
          tally(result.result)
        }
      }),
    )
    return { saved, failed, discarded }
  }

  return {
    summary,
    queuedCaseIds,
    clearAll,
    clearAllForCase,
    clearOne,
    queue,
    load,
    blockedIssue,
    reconcile,
    save,
    flushOne,
    flushAll,
  }
}
