import { describe, expect, it, vi } from "vitest"

import { createAutosaveManager } from "./autosave-manager"
import { EVENT_MUTATION_INDEX_KEY, eventMutationKey } from "./event-mutation-journal"
import { PENDING_EVENTS_INDEX_KEY, pendingEventsKey } from "./pending-events"
import type { KVAdapter } from "./protocol"

declare function setTimeout(handler: () => void, timeout?: number): unknown

// One send order per case (9.13.0): every change reaches the server in the
// order it was made, and a change to something that never left the device is
// made to it there.

function memoryKV(): KVAdapter & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    async get(key) { return data.get(key) ?? null },
    async set(key, value) { data.set(key, value) },
    async delete(key) { data.delete(key) },
  }
}

type Sent = { kind: "append" | "upsert" | "delete"; id: string; body?: Record<string, unknown> }

/** A server that records what arrives, and can be switched off. */
function harness(kv = memoryKV()) {
  const sent: Sent[] = []
  const server = { online: true, failNext: 0 as number, onlyStatus: 0 as number }
  const reply = () => {
    if (!server.online) throw new TypeError("offline")
    if (server.failNext > 0) {
      server.failNext -= 1
      return { ok: false, status: 503 }
    }
    return { ok: true, status: 200, revision: 1 }
  }
  const manager = createAutosaveManager({
    outbox: { kv, sendPatch: vi.fn(), classifyError: () => ({ kind: "network" }) },
    pendingEvents: {
      kv,
      postEvent: async (_caseId, event) => {
        const result = reply()
        if (result.ok) sent.push({ kind: "append", id: String(event.id), body: event as Record<string, unknown> })
        return result
      },
      isNetworkError: error => error instanceof TypeError,
    },
    eventMutations: {
      kv,
      send: async operation => {
        const result = reply()
        if (result.ok) sent.push({ kind: operation.kind === "event.delete" ? "delete" : "upsert", id: operation.eventId })
        return result
      },
      isNetworkError: error => error instanceof TypeError,
    },
  })
  return { manager, sent, server, kv }
}

const event = (id: string, extra: Record<string, unknown> = {}) => ({ id, ts: "2026-09-27T12:00:00.000Z", type: "infusion_stop", infId: "i", ...extra })
let n = 0
const mutation = (kind: "event.upsert" | "event.delete", eventId: string, body?: Record<string, unknown>) => ({
  operationId: `op-${++n}`,
  caseId: "case-1",
  kind,
  eventId,
  ...(kind === "event.upsert" ? { event: body ?? event(eventId) } : {}),
  baseRevision: null,
  queuedAt: "2026-09-27T12:00:00.000Z",
}) as Parameters<ReturnType<typeof createAutosaveManager>["stageEventMutation"]>[0]

describe("one send order per case", () => {
  it("a deletion of a stop entered offline never lets the stop come back", async () => {
    const { manager, sent, server } = harness()
    server.online = false
    await manager.appendEvent("case-1", event("stop"))
    await manager.stageEventMutation(mutation("event.delete", "stop"))
    server.online = true
    await manager.flushCase("case-1")
    // The stop and its deletion cancelled on the device: nothing was sent.
    expect(sent).toEqual([])
    expect(manager.getState("case-1").pending).toBe(0)
  })

  it("an edit of an unsent entry becomes its content, sent once", async () => {
    const { manager, sent, server } = harness()
    server.online = false
    await manager.appendEvent("case-1", event("stop", { ts: "2026-09-27T12:10:00.000Z" }))
    await manager.stageEventMutation(mutation("event.upsert", "stop", event("stop", { ts: "2026-09-27T12:40:00.000Z" })))
    server.online = true
    await manager.flushCase("case-1")
    expect(sent).toEqual([expect.objectContaining({ kind: "append", id: "stop", body: expect.objectContaining({ ts: "2026-09-27T12:40:00.000Z" }) })])
  })

  it("a saved stop deleted and a new stop entered arrive in that order", async () => {
    const { manager, sent, server } = harness()
    await manager.appendEvent("case-1", event("old-stop"))
    server.online = false
    await manager.stageEventMutation(mutation("event.delete", "old-stop"))
    await manager.appendEvent("case-1", event("new-stop"))
    server.online = true
    await manager.flushCase("case-1")
    expect(sent.map(item => `${item.kind}:${item.id}`)).toEqual(["append:old-stop", "delete:old-stop", "append:new-stop"])
  })

  it("a server error stops the pass: nothing is sent ahead of what failed", async () => {
    const { manager, sent, server } = harness()
    server.online = false
    await manager.appendEvent("case-1", event("a"))
    await manager.appendEvent("case-1", event("b"))
    server.online = true
    server.failNext = 1
    await manager.flushCase("case-1")
    expect(sent).toEqual([])
    await manager.flushCase("case-1")
    expect(sent.map(item => item.id)).toEqual(["a", "b"])
  })

  it("deleting something the server no longer has is done, not refused", async () => {
    const kv = memoryKV()
    const send = vi.fn(async () => ({ ok: false, status: 404 }))
    const deleting = createAutosaveManager({
      outbox: { kv, sendPatch: vi.fn(), classifyError: () => ({ kind: "network" }) },
      pendingEvents: { kv, postEvent: vi.fn(), isNetworkError: () => false },
      eventMutations: { kv, send, isNetworkError: () => false },
    })
    await deleting.stageEventMutation(mutation("event.delete", "gone"))
    expect(send).toHaveBeenCalledTimes(1)
    expect(await deleting.eventMutations.load("case-1")).toEqual([])
    expect(JSON.parse(kv.data.get("lospor_autosave_event_mutation_dropped_v1") ?? "[]")).toEqual([])
  })

  it("changes queued before the send order existed go first, in the old order", async () => {
    const kv = memoryKV()
    // A device upgraded with an entry and an edit already queued.
    kv.data.set(pendingEventsKey("case-1"), JSON.stringify([event("legacy")]))
    kv.data.set(PENDING_EVENTS_INDEX_KEY, JSON.stringify(["case-1"]))
    kv.data.set(eventMutationKey("case-1"), JSON.stringify([mutation("event.upsert", "saved-before")]))
    kv.data.set(EVENT_MUTATION_INDEX_KEY, JSON.stringify(["case-1"]))
    const { manager, sent } = harness(kv)
    await manager.appendEvent("case-1", event("new"))
    expect(sent.map(item => `${item.kind}:${item.id}`)).toEqual(["append:legacy", "upsert:saved-before", "append:new"])
  })

  it("an entry queued while a send is in flight is kept", async () => {
    const kv = memoryKV()
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    const posted: string[] = []
    const manager = createAutosaveManager({
      outbox: { kv, sendPatch: vi.fn(), classifyError: () => ({ kind: "network" }) },
      pendingEvents: {
        kv,
        postEvent: async (_caseId, ev) => {
          if (ev.id === "slow") await gate
          posted.push(String(ev.id))
          return { ok: true, status: 200, revision: 1 }
        },
        isNetworkError: () => false,
      },
      eventMutations: { kv, send: vi.fn(), isNetworkError: () => false },
    })
    const first = manager.appendEvent("case-1", event("slow"))
    await new Promise<void>(resolve => { setTimeout(() => resolve(), 10) })
    const second = manager.appendEvent("case-1", event("during"))
    release()
    await Promise.all([first, second])
    expect(posted).toEqual(["slow", "during"])
    expect(await manager.pendingEvents.loadPending("case-1")).toEqual([])
  })
})

describe("the last change made wins across devices", () => {
  it("an edit refused because a later one was made elsewhere is listed as refused, not retried", async () => {
    const kv = memoryKV()
    const send = vi.fn(async () => ({ ok: false, status: 412 }))
    const manager = createAutosaveManager({
      outbox: { kv, sendPatch: vi.fn(), classifyError: () => ({ kind: "network" }) },
      pendingEvents: { kv, postEvent: vi.fn(), isNetworkError: () => false },
      eventMutations: { kv, send, isNetworkError: () => false },
    })
    await manager.stageEventMutation(mutation("event.upsert", "stop"))
    await manager.flushCase("case-1")
    expect(send).toHaveBeenCalledTimes(1)
    expect(await manager.eventMutations.load("case-1")).toEqual([])
    expect(manager.getState("case-1").refused).toEqual([expect.objectContaining({ eventId: "stop", status: 412 })])
  })
})
