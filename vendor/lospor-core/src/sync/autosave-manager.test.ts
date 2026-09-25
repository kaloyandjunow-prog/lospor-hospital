import { describe, expect, it, vi } from "vitest"

import { createAutosaveManager } from "./autosave-manager"
import { outboxPatchKey, type PatchFailure } from "./outbox"
import type { KVAdapter } from "./protocol"

declare function setTimeout(handler: () => void, timeout?: number): unknown

function memoryKV(): KVAdapter & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    async get(key) { return data.get(key) ?? null },
    async set(key, value) { data.set(key, value) },
    async delete(key) { data.delete(key) },
  }
}

function manager(
  kv: ReturnType<typeof memoryKV>,
  sendPatch = vi.fn(),
  classifyError: (error: unknown) => PatchFailure =
    (error) => error instanceof TypeError ? { kind: "network" } : { kind: "other" },
) {
  return createAutosaveManager({
    outbox: {
      kv,
      sendPatch,
      classifyError,
    },
    pendingEvents: {
      kv,
      postEvent: vi.fn().mockResolvedValue({ ok: true, status: 200, revision: 3 }),
      isNetworkError: (error) => error instanceof TypeError,
    },
    eventMutations: {
      kv,
      send: vi.fn().mockResolvedValue({ ok: true, status: 200, revision: 3 }),
      isNetworkError: (error) => error instanceof TypeError,
    },
    now: () => new Date("2026-07-23T20:00:00.000Z"),
  })
}

describe("createAutosaveManager", () => {
  it("persists a section patch before attempting the network", async () => {
    const kv = memoryKV()
    const sendPatch = vi.fn(async () => {
      expect(kv.data.has(outboxPatchKey("case-1", "preop"))).toBe(true)
      return { preopRevision: 6 }
    })
    const autosave = manager(kv, sendPatch)
    autosave.hydrateSection("case-1", "preop", { ageYears: 40 }, 5)

    await expect(autosave.saveSection("case-1", "preop", { ageYears: 41 })).resolves.toEqual({
      result: "saved",
      response: { preopRevision: 6 },
    })
    expect(autosave.getRevision("case-1", "preop")).toBe(6)
    expect(autosave.getState("case-1")).toMatchObject({ status: "saved", pending: 0 })
  })

  it("keeps a durable patch after a network failure and flushes it after recreation", async () => {
    const kv = memoryKV()
    const offline = manager(kv, vi.fn().mockRejectedValue(new TypeError("offline")))
    offline.hydrateSection("case-1", "postop", { disposition: "WARD" }, 1)
    await expect(offline.saveSection("case-1", "postop", { disposition: "ICU" }))
      .resolves.toEqual({ result: "queued" })
    expect(offline.getState("case-1")).toMatchObject({ status: "queued", pending: 1 })

    const onlineSend = vi.fn().mockResolvedValue({ postopRevision: 2 })
    const reopened = manager(kv, onlineSend)
    await reopened.flushCase("case-1")
    expect(onlineSend).toHaveBeenCalledTimes(1)
    expect(reopened.getState("case-1")).toMatchObject({ status: "saved", pending: 0 })
  })


  it("preserves an HTTP rejection while the durable patch remains queued", async () => {
    const kv = memoryKV()
    const rejection = new Error("rejected")
    const autosave = manager(
      kv,
      vi.fn().mockRejectedValue(rejection),
      error => error === rejection
        ? { kind: "http", status: 422, message: "PEDIATRIC_AGE_REQUIRED" }
        : { kind: "other" },
    )
    autosave.hydrateSection("case-1", "preop", { clinicalMode: "ADULT" }, 1)

    await expect(autosave.saveSection("case-1", "preop", {
      clinicalMode: "PEDIATRIC",
    })).resolves.toMatchObject({
      result: "queued",
      failure: {
        kind: "http",
        status: 422,
        message: "PEDIATRIC_AGE_REQUIRED",
      },
    })
    expect(autosave.getState("case-1")).toMatchObject({
      status: "queued",
      pending: 1,
      error: "PEDIATRIC_AGE_REQUIRED",
    })
  })
  it("accepts explicit partial section patches without losing the full snapshot", async () => {
    const kv = memoryKV()
    const sendPatch = vi.fn()
      .mockResolvedValueOnce({ intraopRevision: 2 })
      .mockResolvedValueOnce({ intraopRevision: 3 })
    const autosave = manager(kv, sendPatch)
    autosave.hydrateSection("case-1", "intraop", { position: "SUPINE", technique: "GENERAL" }, 1)

    await autosave.saveSection("case-1", "intraop", { position: "PRONE" }, { partial: true })
    await autosave.saveSection("case-1", "intraop", { position: "PRONE", technique: "REGIONAL" })

    expect(sendPatch).toHaveBeenNthCalledWith(1, "case-1", "intraop", { position: "PRONE" }, 1)
    expect(sendPatch).toHaveBeenNthCalledWith(2, "case-1", "intraop", { technique: "REGIONAL" }, 2)
  })

  it("exposes a permanent blocked field without retrying its unchanged value", async () => {
    const kv = memoryKV()
    const issue = {
      code: "PII_BLOCKED",
      field: "teamNotes",
      reason: "likely_name",
      message: "Team notes appear to contain a name.",
      retryable: false,
      blockedKeys: ["teamNotes"],
    } as const
    const blockedError = new Error("blocked")
    const sendPatch = vi.fn()
      .mockRejectedValueOnce(blockedError)
      .mockResolvedValue({ preopRevision: 2 })
    const autosave = manager(
      kv,
      sendPatch,
      (error) => error === blockedError
        ? { kind: "http", status: 400, blocked: issue, message: issue.message }
        : { kind: "other" },
    )
    autosave.hydrateSection("case-1", "preop", { teamNotes: null, ageYears: 55 }, 1)

    await expect(autosave.saveSection("case-1", "preop", {
      teamNotes: "Ivan Petrov",
      ageYears: 55,
    })).resolves.toMatchObject({ result: "blocked", blocked: issue })
    expect(autosave.getState("case-1")).toMatchObject({
      status: "blocked",
      pending: 1,
      error: issue.message,
      blocked: issue,
    })

    await autosave.flushCase("case-1")
    expect(sendPatch).toHaveBeenCalledTimes(1)

    await autosave.appendEvent("case-1", {
      id: "event-1",
      ts: "2026-07-23T20:00:00.000Z",
      type: "note",
    })
    expect(autosave.getState("case-1")).toMatchObject({
      status: "blocked",
      error: issue.message,
      blocked: issue,
    })

    await expect(autosave.saveSection(
      "case-1",
      "postop",
      { disposition: "WARD" },
      { partial: true },
    )).resolves.toMatchObject({ result: "saved" })
    expect(autosave.getState("case-1")).toMatchObject({
      status: "blocked",
      error: issue.message,
      blocked: issue,
    })

    await expect(autosave.saveSection("case-1", "preop", {
      teamNotes: "No identifying information",
      ageYears: 55,
    })).resolves.toMatchObject({ result: "saved" })
    expect(autosave.getState("case-1")).toMatchObject({ status: "saved", pending: 0, blocked: null })
  })

  it("surfaces a live save conflict instead of resending a stale payload", async () => {
    const kv = memoryKV()
    const rejection = new Error("stale")
    const onConflict = vi.fn()
    const autosave = createAutosaveManager({
      outbox: {
        kv,
        sendPatch: vi.fn().mockRejectedValue(rejection),
        classifyError: (error) => error === rejection
          ? { kind: "http", status: 409, serverRevision: 9 }
          : { kind: "other" },
        shouldRetryConflict: () => false,
      },
      pendingEvents: { kv, postEvent: vi.fn(), isNetworkError: () => false },
      eventMutations: { kv, send: vi.fn(), isNetworkError: () => false },
      onConflict,
      now: () => new Date("2026-07-23T20:00:00.000Z"),
    })
    autosave.hydrateSection("case-1", "preop", { asaScore: "II" }, 3)

    await expect(autosave.saveSection("case-1", "preop", { asaScore: "III" })).resolves.toEqual({
      result: "conflict",
      conflict: { localPayload: { asaScore: "III" }, serverRevision: 9 },
    })
    expect(autosave.getState("case-1")).toMatchObject({
      status: "conflict",
      pending: 1,
      conflict: { caseId: "case-1", section: "preop", localPayload: { asaScore: "III" }, serverRevision: 9 },
    })
    expect(onConflict).toHaveBeenCalledWith({
      caseId: "case-1",
      section: "preop",
      localPayload: { asaScore: "III" },
      serverRevision: 9,
    })
    // Not cleared, not resent — still there for a background flush to re-report
    // until the clinician resolves it.
    expect(autosave.getState("case-1")).toMatchObject({ pending: 1 })
  })

  it("a background flush reports a conflict for a case nobody has open", async () => {
    const kv = memoryKV()
    const rejection = new Error("stale")
    const onConflict = vi.fn()
    const queuer = createAutosaveManager({
      outbox: { kv, sendPatch: vi.fn().mockRejectedValue(new TypeError("offline")), classifyError: (e) => e instanceof TypeError ? { kind: "network" } : { kind: "other" } },
      pendingEvents: { kv, postEvent: vi.fn(), isNetworkError: () => false },
      eventMutations: { kv, send: vi.fn(), isNetworkError: () => false },
    })
    queuer.hydrateSection("case-1", "postop", { painScoreNRS: 2 }, 1)
    await expect(queuer.saveSection("case-1", "postop", { painScoreNRS: 5 })).resolves.toEqual({ result: "queued" })

    const flusher = createAutosaveManager({
      outbox: {
        kv,
        sendPatch: vi.fn().mockRejectedValue(rejection),
        classifyError: (error) => error === rejection
          ? { kind: "http", status: 409, serverRevision: "server-t9" }
          : { kind: "other" },
        shouldRetryConflict: () => false,
      },
      pendingEvents: { kv, postEvent: vi.fn(), isNetworkError: () => false },
      eventMutations: { kv, send: vi.fn(), isNetworkError: () => false },
      onConflict,
    })
    await flusher.flushCase("case-1")

    expect(onConflict).toHaveBeenCalledWith({
      caseId: "case-1",
      section: "postop",
      localPayload: { painScoreNRS: 5 },
      serverRevision: "server-t9",
    })
    expect(flusher.getState("case-1")).toMatchObject({ status: "conflict", pending: 1 })
  })

  it("serializes event append and edit/delete through one case manager", async () => {
    const kv = memoryKV()
    const autosave = manager(kv)
    autosave.setRevision("case-1", "intraop", 2)

    await autosave.appendEvent("case-1", { id: "event-1", ts: "2026-07-23T20:00:00.000Z", type: "drug" })
    await autosave.stageEventMutation({
      operationId: "delete-1",
      caseId: "case-1",
      kind: "event.delete",
      eventId: "event-1",
      baseRevision: 2,
      queuedAt: "2026-07-23T20:01:00.000Z",
    })

    expect(autosave.getState("case-1")).toMatchObject({ status: "saved", pending: 0 })
    await expect(autosave.waitForCase("case-1")).resolves.toBeUndefined()
  })

  it("flushes a queued intraop timing patch before its dependent event", async () => {
    const kv = memoryKV()
    const order: string[] = []
    const autosave = createAutosaveManager({
      outbox: {
        kv,
        sendPatch: vi.fn(async () => {
          order.push("timing")
          return { intraopRevision: 2 }
        }),
        classifyError: () => ({ kind: "other" }),
      },
      pendingEvents: {
        kv,
        postEvent: vi.fn(async () => {
          order.push("event")
          return { ok: true, status: 200, revision: 3 }
        }),
        isNetworkError: () => false,
      },
      eventMutations: {
        kv,
        send: vi.fn().mockResolvedValue({ ok: true, status: 200, revision: 4 }),
        isNetworkError: () => false,
      },
    })
    autosave.hydrateSection("case-1", "intraop", {}, 1)
    await autosave.outbox.queue(
      "case-1",
      "intraop",
      {
        startTime: "11:45",
        startedAt: "2026-07-24T08:45:00.000Z",
        timezone: "Europe/Sofia",
      },
      1,
    )

    await autosave.appendEvent("case-1", {
      id: "start",
      ts: "2026-07-24T08:45:00.000Z",
      type: "clinical_event",
    })

    expect(order).toEqual(["timing", "event"])
    expect(autosave.getRevision("case-1", "intraop")).toBe(3)
  })

  it("keeps an event queued while its intraop timing patch is offline", async () => {
    const kv = memoryKV()
    const postEvent = vi.fn().mockResolvedValue({ ok: true, status: 200, revision: 3 })
    const offline = new TypeError("offline")
    const autosave = createAutosaveManager({
      outbox: {
        kv,
        sendPatch: vi.fn().mockRejectedValue(offline),
        classifyError: () => ({ kind: "network" }),
      },
      pendingEvents: {
        kv,
        postEvent,
        isNetworkError: (error) => error instanceof TypeError,
      },
      eventMutations: {
        kv,
        send: vi.fn().mockResolvedValue({ ok: true, status: 200, revision: 4 }),
        isNetworkError: (error) => error instanceof TypeError,
      },
    })
    await autosave.outbox.queue("case-1", "intraop", {
      startedAt: "2026-07-24T08:45:00.000Z",
      timezone: "Europe/Sofia",
    })

    await autosave.appendEvent("case-1", {
      id: "start",
      ts: "2026-07-24T08:45:00.000Z",
      type: "clinical_event",
    })

    expect(postEvent).not.toHaveBeenCalled()
    expect(autosave.getState("case-1")).toMatchObject({ status: "queued", pending: 2 })
  })

  it("reports an offline event as queued, not failed", async () => {
    const kv = memoryKV()
    const offline = new TypeError("offline")
    const autosave = createAutosaveManager({
      outbox: {
        kv,
        sendPatch: vi.fn(),
        classifyError: () => ({ kind: "other" }),
      },
      pendingEvents: {
        kv,
        postEvent: vi.fn().mockRejectedValue(offline),
        isNetworkError: (error) => error instanceof TypeError,
      },
      eventMutations: {
        kv,
        send: vi.fn().mockResolvedValue({ ok: true, status: 200, revision: 4 }),
        isNetworkError: (error) => error instanceof TypeError,
      },
    })

    await autosave.appendEvent("case-1", {
      id: "vital",
      ts: "2026-07-24T08:45:00.000Z",
      type: "vital",
    })

    // A thrown fetch while offline is not a rejection: the event is still
    // retained for retry, so the reported status must not read "failed"
    // ahead of "queued" -- that previously showed the clinician a scary
    // "could not be saved" message for an event that would in fact replay.
    expect(autosave.getState("case-1")).toMatchObject({ status: "queued", pending: 1, error: null })
  })
})

// The live save and the 15 s background flusher used to send the same stored
// patch twice. The second copy 409'd, was retried on the newer revision, and
// wrote the older value over an edit saved in between -- the screen showed the
// new value, the server kept the old one.
describe("one flush per case section at a time", () => {
  class Conflict extends Error {
    constructor(readonly serverRevision: number) { super("409") }
  }
  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

  function server(latencyMs = 20) {
    const state = { revision: 1, fields: { x: "a", y: "a" } as Record<string, unknown>, log: [] as string[] }
    const sendPatch = vi.fn(async (_caseId: string, _section: string, payload: unknown, base: unknown) => {
      await sleep(latencyMs)
      const fields = payload as Record<string, unknown>
      if (base !== state.revision) {
        state.log.push(`409 base=${String(base)} ${JSON.stringify(fields)}`)
        throw new Conflict(state.revision)
      }
      Object.assign(state.fields, fields)
      state.revision += 1
      state.log.push(`200 base=${String(base)} ${JSON.stringify(fields)}`)
      return { preopRevision: state.revision }
    })
    return { state, sendPatch }
  }
  const classify = (error: unknown): PatchFailure => error instanceof Conflict
    ? { kind: "http", status: 409, serverRevision: error.serverRevision }
    : error instanceof TypeError ? { kind: "network" } : { kind: "other" }

  it("does not let a background flush put back a value the user has since changed", async () => {
    const kv = memoryKV()
    const { state, sendPatch } = server()
    const autosave = manager(kv, sendPatch, classify)
    autosave.hydrateSection("case-1", "preop", { x: "a", y: "a" }, 1)

    const first = autosave.saveSection("case-1", "preop", { x: "b", y: "a" })
    while (!kv.data.has(outboxPatchKey("case-1", "preop"))) await sleep(1)
    const tick = autosave.flushAll()
    await first
    await Promise.all([autosave.saveSection("case-1", "preop", { x: "c", y: "a" }), tick])
    await autosave.flushAll()

    expect(state.fields.x).toBe("c")
    expect(state.log).toEqual([`200 base=1 {"x":"b"}`, `200 base=2 {"x":"c"}`])
    expect(kv.data.has(outboxPatchKey("case-1", "preop"))).toBe(false)
  })

  it("sends a stored patch once when two flushes ask for it together", async () => {
    const kv = memoryKV()
    const { state, sendPatch } = server()
    const autosave = manager(kv, sendPatch, classify)
    autosave.hydrateSection("case-1", "preop", { x: "a" }, 1)
    await autosave.outbox.queue("case-1", "preop", { x: "b" }, 1)

    const results = await Promise.all([autosave.flushCase("case-1"), autosave.flushAll()])

    expect(sendPatch).toHaveBeenCalledTimes(1)
    expect(state.log).toEqual([`200 base=1 {"x":"b"}`])
    expect(results.map(result => result.saved)).toContain(1)
  })

  it("keeps an edit queued while a send was out, and sends it on the new revision", async () => {
    const kv = memoryKV()
    const { state, sendPatch } = server(40)
    const autosave = manager(kv, sendPatch, classify)
    await autosave.outbox.queue("case-1", "preop", { x: "b" }, 1)

    const flushing = autosave.outbox.flushOne("case-1", "preop")
    await sleep(10)
    await autosave.outbox.queue("case-1", "preop", { y: "z" }, 1)
    await flushing

    const stored = JSON.parse(kv.data.get(outboxPatchKey("case-1", "preop"))!)
    expect(stored.baseUpdatedAt).toBe(2)
    expect(stored.payload).toEqual({ x: "b", y: "z" })

    await autosave.outbox.flushOne("case-1", "preop")
    expect(state.log).toEqual([`200 base=1 {"x":"b"}`, `200 base=2 {"x":"b","y":"z"}`])
    expect(state.fields).toEqual({ x: "b", y: "z" })
  })

  it("does not overwrite an edit queued during a send that then failed", async () => {
    const kv = memoryKV()
    let release: () => void = () => {}
    const sendPatch = vi.fn(() => new Promise((_resolve, reject) => { release = () => reject(new TypeError("offline")) }))
    const autosave = manager(kv, sendPatch, classify)
    await autosave.outbox.queue("case-1", "preop", { x: "b" }, 1)

    const flushing = autosave.outbox.flushOne("case-1", "preop")
    while (sendPatch.mock.calls.length === 0) await sleep(1)
    await autosave.outbox.queue("case-1", "preop", { x: "c" }, 1)
    release()
    await flushing

    expect(JSON.parse(kv.data.get(outboxPatchKey("case-1", "preop"))!).payload).toEqual({ x: "c" })
  })

  it("does not hold up an intraop event behind a section flush (no deadlock)", async () => {
    const kv = memoryKV()
    const autosave = manager(kv, vi.fn(async () => { await sleep(20); return { intraopRevision: 2 } }), classify)
    autosave.hydrateSection("case-1", "intraop", {}, 1)
    await autosave.outbox.queue("case-1", "intraop", { positions: ["supine"] }, 1)

    await expect(Promise.race([
      Promise.all([
        autosave.flushCase("case-1"),
        autosave.appendEvent("case-1", { id: "event-1", ts: "2026-07-23T20:00:00.000Z", type: "drug" }),
        autosave.saveSection("case-1", "intraop", { positions: ["prone"] }, { partial: true }),
      ]).then(() => "done"),
      sleep(2_000).then(() => "stuck"),
    ])).resolves.toBe("done")
  })
})
