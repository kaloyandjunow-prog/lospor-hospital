import { describe, expect, it, vi } from "vitest"

import { createEventMutationJournal, type EventMutation } from "./event-mutation-journal"
import type { KVAdapter } from "./protocol"

function memoryKV(): KVAdapter & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    async get(key) { return data.get(key) ?? null },
    async set(key, value) { data.set(key, value) },
    async delete(key) { data.delete(key) },
  }
}

function mutation(overrides: Partial<EventMutation> = {}): EventMutation {
  return {
    operationId: "op-1",
    caseId: "case-1",
    kind: "event.delete",
    eventId: "event-1",
    baseRevision: 2,
    queuedAt: "2026-07-23T20:00:00.000Z",
    ...overrides,
  } as EventMutation
}

describe("createEventMutationJournal", () => {
  it("survives recreation and retries a 409 once with the server revision", async () => {
    const kv = memoryKV()
    const send = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 409, serverRevision: 7 })
      .mockResolvedValueOnce({ ok: true, status: 200, revision: 8 })
    const first = createEventMutationJournal({ kv, send, isNetworkError: () => false })
    await first.stage(mutation())

    const acknowledged: Array<number | string | null> = []
    const reopened = createEventMutationJournal({
      kv,
      send,
      isNetworkError: () => false,
      onAcknowledged: (_caseId, revision) => acknowledged.push(revision),
    })
    await expect(reopened.flushCase("case-1")).resolves.toEqual({ saved: 1, failed: 0, dropped: 0 })
    expect(send.mock.calls.map((call) => call[1])).toEqual([2, 7])
    expect(acknowledged).toEqual([8])
    expect(await reopened.load("case-1")).toEqual([])
  })

  it("keeps the newest unsent intent for one event", async () => {
    const kv = memoryKV()
    const journal = createEventMutationJournal({
      kv,
      send: vi.fn(),
      isNetworkError: () => false,
    })
    await journal.stage(mutation({ operationId: "edit", kind: "event.upsert", event: { id: "event-1", dose: 1 } }))
    await journal.stage(mutation({ operationId: "delete", kind: "event.delete" }))
    expect(await journal.load("case-1")).toEqual([expect.objectContaining({
      operationId: "delete",
      kind: "event.delete",
    })])
  })

  it("keeps retryable failures and drops permanent rejections visibly", async () => {
    const kv = memoryKV()
    const send = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 400 })
    const journal = createEventMutationJournal({ kv, send, isNetworkError: () => false })
    await journal.stage(mutation({ operationId: "retry", eventId: "event-retry" }))
    await journal.stage(mutation({ operationId: "bad", eventId: "event-bad" }))

    expect(await journal.flushCase("case-1")).toEqual({ saved: 0, failed: 1, dropped: 1 })
    expect(await journal.load("case-1")).toEqual([expect.objectContaining({ operationId: "retry" })])
  })
})
