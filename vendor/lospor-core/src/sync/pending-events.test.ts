import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import type { KVAdapter } from "./protocol"
import {
  createPendingEventStore,
  type PendingEventStoreDeps,
  DROPPED_EVENTS_KEY,
  mergeLogWithPendingEvents,
  markEventFailed,
  markEventSynced,
  PENDING_EVENTS_INDEX_KEY,
  pendingEventsKey,
  prependPendingEvent,
  removePendingEvent,
  serializeEventForServer,
  serializeLogForServer,
  stripLogSyncStatuses,
} from "./pending-events"

function memoryKV(): KVAdapter & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    async get(key) { return data.get(key) ?? null },
    async set(key, value) { data.set(key, value) },
    async delete(key) { data.delete(key) },
  }
}

class NetworkError extends Error {}

// Core's tsconfig has no DOM/node lib; the test runtime provides timers.
declare function setTimeout(handler: () => void, timeout?: number): unknown

describe("pure helpers", () => {
  it("merges pending ahead of duplicate server events, newest first", () => {
    const pending = [
      { id: "same", ts: "2026-07-01T10:03:00.000Z", label: "pending version" },
      { id: "pending-only", ts: "2026-07-01T10:04:00.000Z", label: "pending only" },
    ]
    const server = [
      { id: "server-only", ts: "2026-07-01T10:05:00.000Z", label: "server only" },
      { id: "same", ts: "2026-07-01T10:06:00.000Z", label: "server duplicate" },
    ]

    expect(mergeLogWithPendingEvents(server, pending)).toEqual([
      { id: "server-only", ts: "2026-07-01T10:05:00.000Z", label: "server only" },
      { id: "pending-only", ts: "2026-07-01T10:04:00.000Z", label: "pending only" },
      { id: "same", ts: "2026-07-01T10:03:00.000Z", label: "pending version" },
    ])
  })

  it("prepends replacing duplicates, removes by id, marks synced/failed", () => {
    expect(prependPendingEvent([{ id: "same", ts: "old" }, { id: "other", ts: "o" }], { id: "same", ts: "new" }))
      .toEqual([{ id: "same", ts: "new" }, { id: "other", ts: "o" }])
    expect(removePendingEvent([{ id: "remove", ts: "a" }, { id: "keep", ts: "b" }], "remove"))
      .toEqual([{ id: "keep", ts: "b" }])
    expect(markEventSynced([{ id: "e", ts: "a", syncStatus: "pending" }], "e")).toEqual([{ id: "e", ts: "a" }])
    expect(markEventFailed([{ id: "e", ts: "a" }], "e")).toEqual([{ id: "e", ts: "a", syncStatus: "failed" }])
  })

  it("serializes for the server: strips syncStatus, whole log oldest-first", () => {
    expect(serializeEventForServer({ id: "e", ts: "a", syncStatus: "pending", hr: 70 }))
      .toEqual({ id: "e", ts: "a", hr: 70 })
    expect(serializeLogForServer([
      { id: "new", ts: "2", syncStatus: "pending" },
      { id: "old", ts: "1" },
    ])).toEqual({ log: [{ id: "old", ts: "1" }, { id: "new", ts: "2" }] })
    expect(stripLogSyncStatuses([{ id: "e", ts: "a", syncStatus: "failed" }])).toEqual([{ id: "e", ts: "a" }])
  })
})

describe("createPendingEventStore", () => {
  let kv: ReturnType<typeof memoryKV>
  let postEvent: Mock<PendingEventStoreDeps["postEvent"]>

  beforeEach(() => {
    kv = memoryKV()
    postEvent = vi.fn<PendingEventStoreDeps["postEvent"]>()
  })

  function store() {
    return createPendingEventStore({
      kv,
      postEvent,
      isNetworkError: (err) => err instanceof NetworkError,
    })
  }

  it("storePending maintains the case index", async () => {
    const s = store()
    await s.storePending("case-1", [{ id: "e1", ts: "t" }])
    expect(JSON.parse(kv.data.get(PENDING_EVENTS_INDEX_KEY)!)).toEqual(["case-1"])

    await s.storePending("case-1", [])
    expect(kv.data.has(PENDING_EVENTS_INDEX_KEY)).toBe(false)
    expect(kv.data.has(pendingEventsKey("case-1"))).toBe(false)
  })

  it("flushCase replays oldest-first and clears acknowledged events", async () => {
    const s = store()
    await s.storePending("case-1", [
      { id: "newest", ts: "2" },
      { id: "oldest", ts: "1" },
    ])
    postEvent.mockResolvedValue({ ok: true, status: 200 })

    await expect(s.flushCase("case-1")).resolves.toEqual({ saved: 2, failed: 0 })
    expect(postEvent.mock.calls.map((c) => c[1].id)).toEqual(["oldest", "newest"])
    expect(await s.loadPending("case-1")).toEqual([])
  })

  it("stops the batch on 401/409 and keeps the events", async () => {
    const s = store()
    await s.storePending("case-1", [
      { id: "second", ts: "2" },
      { id: "first", ts: "1" },
    ])
    postEvent.mockResolvedValue({ ok: false, status: 401 })

    await expect(s.flushCase("case-1")).resolves.toEqual({ saved: 0, failed: 1 })
    // Only ONE request went out (batch stopped), both events survive.
    expect(postEvent).toHaveBeenCalledTimes(1)
    expect(await s.loadPending("case-1")).toHaveLength(2)
  })

  it("adopts the server revision and retries one 409 immediately", async () => {
    const onAcknowledged = vi.fn()
    const s = createPendingEventStore({
      kv,
      postEvent,
      getRevision: () => 4,
      onAcknowledged,
      isNetworkError: (err) => err instanceof NetworkError,
    })
    await s.storePending("case-1", [{ id: "e1", ts: "1" }])
    postEvent
      .mockResolvedValueOnce({ ok: false, status: 409, serverRevision: 5 })
      .mockResolvedValueOnce({ ok: true, status: 200, revision: 6 })

    await expect(s.flushCase("case-1")).resolves.toEqual({ saved: 1, failed: 0 })
    expect(postEvent.mock.calls.map((call) => call[2])).toEqual([4, 5])
    expect(onAcknowledged).toHaveBeenNthCalledWith(1, "case-1", 5)
    expect(onAcknowledged).toHaveBeenNthCalledWith(2, "case-1", 6)
  })

  it("keeps events on 5xx but continues the batch", async () => {
    const s = store()
    await s.storePending("case-1", [
      { id: "second", ts: "2" },
      { id: "first", ts: "1" },
    ])
    postEvent.mockResolvedValue({ ok: false, status: 503 })

    await expect(s.flushCase("case-1")).resolves.toEqual({ saved: 0, failed: 2 })
    expect(postEvent).toHaveBeenCalledTimes(2)
    expect(await s.loadPending("case-1")).toHaveLength(2)
  })

  it("drops permanent 4xx events into the dropped log — never silently lost", async () => {
    const s = store()
    await s.storePending("case-1", [{ id: "bad", ts: "1", syncStatus: "pending" }])
    postEvent.mockResolvedValue({ ok: false, status: 400 })

    await expect(s.flushCase("case-1")).resolves.toEqual({ saved: 0, failed: 1 })
    expect(await s.loadPending("case-1")).toEqual([])
    const dropped = await s.droppedEvents()
    expect(dropped).toHaveLength(1)
    expect(dropped[0]).toMatchObject({ caseId: "case-1", status: 400, event: { id: "bad", ts: "1" } })
  })

  it("a thrown network error stops the batch and keeps everything", async () => {
    const s = store()
    await s.storePending("case-1", [
      { id: "second", ts: "2" },
      { id: "first", ts: "1" },
    ])
    postEvent.mockRejectedValue(new NetworkError())

    await expect(s.flushCase("case-1")).resolves.toEqual({ saved: 0, failed: 1 })
    expect(postEvent).toHaveBeenCalledTimes(1)
    expect(await s.loadPending("case-1")).toHaveLength(2)
  })

  it("a thrown non-network error keeps the event but continues the batch", async () => {
    const s = store()
    await s.storePending("case-1", [
      { id: "second", ts: "2" },
      { id: "first", ts: "1" },
    ])
    postEvent.mockRejectedValue(new Error("weird"))

    await expect(s.flushCase("case-1")).resolves.toEqual({ saved: 0, failed: 2 })
    expect(postEvent).toHaveBeenCalledTimes(2)
    expect(await s.loadPending("case-1")).toHaveLength(2)
  })

  it("flushAll walks the index through orderWrite", async () => {
    const ordered: string[] = []
    const s = createPendingEventStore({
      kv,
      postEvent: postEvent.mockResolvedValue({ ok: true, status: 200 }),
      isNetworkError: () => false,
      orderWrite: (caseId, run) => {
        ordered.push(caseId)
        return run()
      },
    })
    await s.storePending("case-1", [{ id: "e1", ts: "1" }])
    await s.storePending("case-2", [{ id: "e2", ts: "1" }])

    await expect(s.flushAll()).resolves.toEqual({ saved: 2, failed: 0 })
    expect(ordered).toEqual(["case-1", "case-2"])
  })

  it("clearDropped empties only the dropped log, keeping the pending queue", async () => {
    const s = store()
    await s.storePending("case-1", [{ id: "e1", ts: "1" }])
    kv.data.set(DROPPED_EVENTS_KEY, JSON.stringify([{ caseId: "x" }]))

    await s.clearDropped()

    expect(await s.droppedEvents()).toEqual([])
    expect(await s.loadPending("case-1")).toHaveLength(1)
  })

  it("clearAll wipes pending, index, and dropped log", async () => {
    const s = store()
    await s.storePending("case-1", [{ id: "e1", ts: "1" }])
    kv.data.set(DROPPED_EVENTS_KEY, JSON.stringify([{ caseId: "x" }]))

    await expect(s.clearAll()).resolves.toBe(1)
    expect(kv.data.size).toBe(0)
  })

  it("uses the historical storage keys", () => {
    expect(PENDING_EVENTS_INDEX_KEY).toBe("lospor_pending_intraop_index")
    expect(pendingEventsKey("c1")).toBe("lospor_pending_intraop_c1")
    expect(DROPPED_EVENTS_KEY).toBe("lospor_intraop_dropped")
  })

  it("notifies onChange with the total pending count across cases", async () => {
    const counts: number[] = []
    const s = createPendingEventStore({
      kv,
      postEvent: postEvent.mockResolvedValue({ ok: true, status: 200 }),
      isNetworkError: () => false,
      onChange: (n) => { counts.push(n) },
    })
    const settle = () => new Promise((r) => setTimeout(() => r(undefined), 0))

    await s.storePending("case-1", [{ id: "e1", ts: "1" }, { id: "e2", ts: "2" }])
    await settle()
    expect(counts[counts.length - 1]).toBe(2)

    await s.storePending("case-2", [{ id: "e3", ts: "1" }])
    await settle()
    expect(counts[counts.length - 1]).toBe(3)

    await s.flushAll() // all POSTs succeed → journal drains
    await settle()
    expect(counts[counts.length - 1]).toBe(0)
  })
})
