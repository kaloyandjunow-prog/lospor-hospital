import { describe, expect, it, vi } from "vitest"

import { createAutosaveManager } from "./autosave-manager"
import { outboxPatchKey, type PatchFailure } from "./outbox"
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
})
