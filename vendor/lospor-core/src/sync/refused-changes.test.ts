import { describe, expect, it, vi } from "vitest"

import { intraopRefusedEntry } from "../intraop-attention"
import type { LogEvent } from "../intraop-types"
import { createAutosaveManager, type AutosaveManagerState } from "./autosave-manager"
import type { KVAdapter } from "./protocol"

// What happens to a change the server will never take (9.13.0 coverage
// review): it is dropped from the queue, never retried, and listed -- saying
// what it was and why -- until the clinician marks it seen. And the replies
// that are not refusals: a conflict is retried once with the server's
// revision, an expired session stops the flush with everything still queued.

function memoryKV(): KVAdapter {
  const data = new Map<string, string>()
  return {
    async get(key) { return data.get(key) ?? null },
    async set(key, value) { data.set(key, value) },
    async delete(key) { data.delete(key) },
  }
}

type Reply = { ok: boolean; status: number; revision?: number; serverRevision?: number }

function harness() {
  const replies: Reply[] = []
  const calls: { kind: string; id: string; revision: unknown }[] = []
  const next = (): Reply => replies.shift() ?? { ok: true, status: 200, revision: 1 }
  const kv = memoryKV()
  const manager = createAutosaveManager({
    outbox: { kv, sendPatch: vi.fn(), classifyError: () => ({ kind: "network" }) },
    pendingEvents: {
      kv,
      postEvent: async (_caseId, event, revision) => {
        calls.push({ kind: "append", id: String(event.id), revision })
        return next()
      },
      isNetworkError: error => error instanceof TypeError,
    },
    eventMutations: {
      kv,
      send: async (operation, revision) => {
        calls.push({ kind: operation.kind, id: operation.eventId, revision })
        return next()
      },
      isNetworkError: error => error instanceof TypeError,
    },
  })
  return { manager, replies, calls, state: (): AutosaveManagerState => manager.getState("case-1") }
}

const stop = (extra: Record<string, unknown> = {}) => ({ id: "stop", ts: "2026-09-27T12:40:00.000Z", type: "infusion_stop", infId: "i", ...extra })
let n = 0
const change = (kind: "event.upsert" | "event.delete", event = stop()) => ({
  operationId: `op-${++n}`,
  caseId: "case-1",
  kind,
  eventId: event.id,
  ...(kind === "event.upsert" ? { event } : {}),
  baseRevision: 3,
  queuedAt: "2026-09-27T12:15:00.000Z",
}) as Parameters<ReturnType<typeof createAutosaveManager>["stageEventMutation"]>[0]

describe("a change refused for good", () => {
  it("an edit superseded on another screen (412) is dropped, listed as an edit, and not sent again", async () => {
    const { manager, replies, calls, state } = harness()
    replies.push({ ok: false, status: 412 })
    await manager.stageEventMutation(change("event.upsert", stop({ ts: "2026-09-27T12:35:00.000Z" })))
    await manager.flushCase("case-1")
    await manager.flushCase("case-1")
    expect(calls).toHaveLength(1)
    expect(state().queuedEventIds).toEqual([])
    expect(state().refused).toEqual([expect.objectContaining({
      eventId: "stop", status: 412, change: "edit", event: expect.objectContaining({ ts: "2026-09-27T12:35:00.000Z" }),
    })])
  })

  it("a deletion refused is listed as a deletion; a new entry refused (400) as the entry", async () => {
    const { manager, replies, state } = harness()
    replies.push({ ok: false, status: 400 }, { ok: false, status: 412 })
    await manager.appendEvent("case-1", { id: "dose", ts: "2026-09-27T12:10:00.000Z", type: "drug", name: "Ondansetron", dose: "4", unit: "mg" })
    await manager.stageEventMutation(change("event.delete"))
    await manager.flushCase("case-1")
    const refused = state().refused
    expect(refused.map(item => [item.eventId, item.status, item.change])).toEqual(expect.arrayContaining([
      ["dose", 400, "add"],
      ["stop", 412, "delete"],
    ]))
    expect(refused.find(item => item.change === "delete")!.event).toBeUndefined()
  })

  it("is listed until marked seen, and a later refusal shows again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      vi.setSystemTime(new Date("2026-09-27T12:20:00.000Z"))
      const { manager, replies, state } = harness()
      replies.push({ ok: false, status: 412 })
      await manager.stageEventMutation(change("event.upsert"))
      await manager.flushCase("case-1")
      expect(state().refused).toHaveLength(1)
      vi.setSystemTime(new Date("2026-09-27T12:21:00.000Z"))
      await manager.dismissRefused("case-1")
      expect(state().refused).toEqual([])
      vi.setSystemTime(new Date("2026-09-27T12:22:00.000Z"))
      replies.push({ ok: false, status: 403 })
      await manager.stageEventMutation(change("event.upsert", stop({ id: "other" })))
      await manager.flushCase("case-1")
      expect(state().refused.map(item => item.eventId)).toEqual(["other"])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("whose refusals are listed", () => {
  it("only the case's own: another case's refused entry and edit never show on this one", async () => {
    const { manager, replies, state } = harness()
    replies.push({ ok: false, status: 400 }, { ok: false, status: 412 })
    await manager.appendEvent("case-2", { id: "theirs", ts: "2026-09-27T12:10:00.000Z", type: "drug", name: "Ondansetron", dose: "4", unit: "mg" })
    await manager.stageEventMutation({ ...change("event.upsert", stop({ id: "their-stop" })), caseId: "case-2" })
    await manager.flushCase("case-2")
    expect(manager.getState("case-2").refused.map(item => item.eventId).sort()).toEqual(["their-stop", "theirs"])
    await manager.refreshPending("case-1")
    expect(state().refused).toEqual([])
  })
})

describe("replies that are not refusals", () => {
  it("a new entry meeting a conflict is sent once more with the server's revision", async () => {
    const { manager, replies, calls, state } = harness()
    replies.push({ ok: false, status: 409, serverRevision: 9 })
    await manager.appendEvent("case-1", { id: "dose", ts: "2026-09-27T12:10:00.000Z", type: "drug", name: "Ondansetron", dose: "4", unit: "mg" })
    // At once, in the same send -- not left for a later flush.
    expect(calls.map(call => [call.id, call.revision])).toEqual([["dose", null], ["dose", 9]])
    expect(state().queuedEventIds).toEqual([])
    expect(state().refused).toEqual([])
  })

  it("an expired session on an edit keeps the edit queued and sends it later", async () => {
    const { manager, replies, calls, state } = harness()
    // Staging sends at once, and the flush tries again: both meet the expired session.
    replies.push({ ok: false, status: 401 }, { ok: false, status: 401 })
    await manager.stageEventMutation(change("event.upsert"))
    await manager.flushCase("case-1")
    expect(state().queuedEventIds).toEqual(["stop"])
    expect(state().refused).toEqual([])
    // Signed in again: it goes.
    await manager.flushCase("case-1")
    expect(calls.map(call => call.id)).toEqual(["stop", "stop", "stop"])
    expect(state().queuedEventIds).toEqual([])
  })

  it("a conflict carrying the server's revision is sent once more with it", async () => {
    const { manager, replies, calls, state } = harness()
    replies.push({ ok: false, status: 409, serverRevision: 7 })
    await manager.stageEventMutation(change("event.upsert"))
    await manager.flushCase("case-1")
    expect(calls.map(call => call.revision)).toEqual([3, 7])
    expect(state().queuedEventIds).toEqual([])
    expect(state().refused).toEqual([])
  })

  it("an expired session (401) stops the flush with everything still queued, in order", async () => {
    const { manager, replies, calls, state } = harness()
    replies.push({ ok: false, status: 401 })
    await manager.appendEvent("case-1", { id: "dose", ts: "2026-09-27T12:10:00.000Z", type: "drug", name: "Ondansetron", dose: "4", unit: "mg" })
    await manager.stageEventMutation(change("event.upsert"))
    // The 401 came back for the dose, sent as it was entered: it stayed queued
    // and nothing after it went ahead of it.
    expect(calls[0].id).toBe("dose")
    await manager.flushCase("case-1")
    expect(calls.map(call => call.id)).toEqual(["dose", "dose", "stop"])
    expect(state().queuedEventIds).toEqual([])
    expect(state().refused).toEqual([])
  })
})

describe("how a refused change is listed", () => {
  const log: LogEvent[] = [
    { id: "start", ts: "2026-09-27T12:00:00.000Z", type: "infusion_start", infId: "i", name: "Remifentanil", rate: "0.1", unit: "mcg/kg/min" },
    { id: "stop", ts: "2026-09-27T12:40:00.000Z", type: "infusion_stop", infId: "i" },
  ]

  it("names the drug a stop belongs to, the kind of change, and why -- in Bulgarian, drug names as charted", () => {
    const entry = intraopRefusedEntry({ eventId: "stop", status: 412, at: "2026-09-27T12:50:00.000Z", change: "edit", event: stop({ ts: "2026-09-27T12:35:00.000Z" }) }, "bg", log)
    expect(entry.at).toBe("2026-09-27T12:35:00.000Z")
    expect(entry.text).toMatch(/^Remifentanil ·.+ \(промяна\) — по-късна промяна е направена на друг екран и остава в сила$/)
  })

  it("a refused deletion is named from the saved log, which still holds the entry", () => {
    const entry = intraopRefusedEntry({ eventId: "stop", status: 412, at: "2026-09-27T12:50:00.000Z", change: "delete" }, "en", log)
    expect(entry.at).toBe("2026-09-27T12:40:00.000Z")
    expect(entry.text).toMatch(/^Remifentanil · .+ \(deletion\) — a later change was made on another screen and stands$/)
  })

  it("never shows a raw id: an entry nobody can name is 'An entry', at the time it was refused", () => {
    expect(intraopRefusedEntry({ eventId: "c0ffee-1234", status: 500, at: "2026-09-27T12:50:00.000Z", change: "delete" }, "en"))
      .toEqual({ at: "2026-09-27T12:50:00.000Z", text: "An entry (deletion) — refused by the server" })
    expect(intraopRefusedEntry({ eventId: "dose", status: 400, at: "2026-09-27T12:50:00.000Z", change: "add", event: { id: "dose", ts: "2026-09-27T12:10:00.000Z", type: "drug", name: "Ondansetron", dose: "4", unit: "mg" } }, "bg").text)
      .toMatch(/^.+ 4 mg — нарушава правилата на времевата линия$/)
  })
})
