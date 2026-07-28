import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import type { CaseSection, KVAdapter, SectionRevision } from "./protocol"
import { createCaseOutbox, legacyOutboxPatchKey, OUTBOX_INDEX_KEY, outboxPatchKey, type OutboxDeps, type PatchFailure } from "./outbox"

// Core's tsconfig has no DOM/node lib; the test runtime provides timers.
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

class HttpError extends Error {
  constructor(public status: number) { super(`http ${status}`) }
}
class NetworkError extends Error {}
class BlockedError extends Error {}

const blockedIssue = {
  code: "PII_BLOCKED",
  field: "diagnoses",
  reason: "likely_name",
  message: "Diagnosis appears to contain a name.",
  retryable: false,
  blockedKeys: ["diagnoses", "diagnosis", "icdCode"],
} as const

const classifyError = (err: unknown): PatchFailure => {
  if (err instanceof NetworkError) return { kind: "network" }
  if (err instanceof HttpError) return { kind: "http", status: err.status }
  return { kind: "other" }
}

describe("createCaseOutbox", () => {
  let kv: ReturnType<typeof memoryKV>
  let sendPatch: Mock<OutboxDeps["sendPatch"]>

  beforeEach(() => {
    kv = memoryKV()
    sendPatch = vi.fn<OutboxDeps["sendPatch"]>()
  })

  function outbox() {
    return createCaseOutbox({ kv, sendPatch, classifyError })
  }

  it("saves straight through and clears any queued patch on success", async () => {
    sendPatch.mockResolvedValue({ preopUpdatedAt: "t1" })
    const box = outbox()
    await box.queue("case-1", "preop", { asaScore: "II" }, "base-0")

    const result = await box.save("case-1", "preop", { asaScore: "III" }, "base-1")

    expect(result).toEqual({ result: "saved", response: { preopUpdatedAt: "t1" } })
    expect((await box.summary()).count).toBe(0)
    expect(await box.load("case-1", "preop")).toBeNull()
  })

  it("queues on network failure instead of losing the patch", async () => {
    sendPatch.mockRejectedValue(new NetworkError())
    const box = outbox()

    const result = await box.save("case-1", "preop", { asaScore: "II" }, "base-0")

    expect(result).toEqual({ result: "queued" })
    expect(await box.load("case-1", "preop")).toEqual({ asaScore: "II" })
    expect((await box.summary()).entries).toEqual([{ caseId: "case-1", section: "preop" }])
  })

  it("rethrows non-network save errors", async () => {
    sendPatch.mockRejectedValue(new HttpError(400))
    const box = outbox()

    await expect(box.save("case-1", "preop", {}, null)).rejects.toThrow("http 400")
    expect((await box.summary()).count).toBe(0)
  })

  it("merge-on-queue lays newer fields over queued ones and keeps the original base timestamp", async () => {
    const box = outbox()
    await box.queue("case-1", "preop", { asaScore: "II", weightKg: 80 }, "base-original")
    await box.queue("case-1", "preop", { asaScore: "III" }, "base-newer")

    expect(await box.load("case-1", "preop")).toEqual({ asaScore: "III", weightKg: 80 })
    const stored = JSON.parse(kv.data.get(outboxPatchKey("case-1", "preop"))!)
    expect(stored.baseUpdatedAt).toBe("base-original")
    expect((await box.summary()).count).toBe(1)
  })

  it("flushOne discards permanently-rejected patches (404/403) and keeps transient failures", async () => {
    const box = outbox()
    await box.queue("case-1", "preop", { a: 1 })
    await box.queue("case-2", "preop", { b: 2 })
    await box.queue("case-3", "preop", { c: 3 })

    sendPatch.mockRejectedValueOnce(new HttpError(404))
    await expect(box.flushOne("case-1", "preop")).resolves.toEqual({ result: "empty" })
    expect(await box.load("case-1", "preop")).toBeNull()

    sendPatch.mockRejectedValueOnce(new HttpError(500))
    await expect(box.flushOne("case-2", "preop")).resolves.toEqual({ result: "failed" })
    expect(await box.load("case-2", "preop")).toEqual({ b: 2 })

    sendPatch.mockRejectedValueOnce(new NetworkError())
    await expect(box.flushOne("case-3", "preop")).resolves.toEqual({ result: "failed" })
    expect(await box.load("case-3", "preop")).toEqual({ c: 3 })
  })

  it("flushOne self-heals a 409 once with the server timestamp", async () => {
    const box = outbox()
    await box.queue("case-1", "preop", { asaScore: "III" }, "stale-base")

    const bases: Array<SectionRevision | undefined> = []
    sendPatch.mockImplementation(async (_c, _s, _p, base) => {
      bases.push(base)
      if (bases.length === 1) throw Object.assign(new HttpError(409), { server: true })
      return { preopUpdatedAt: "t-new" }
    })
    // Classifier that surfaces the server timestamp on 409.
    const healingBox = createCaseOutbox({
      kv,
      sendPatch,
      classifyError: (err) =>
        err instanceof HttpError
          ? { kind: "http", status: err.status, serverUpdatedAt: err.status === 409 ? "server-t1" : undefined }
          : { kind: "other" },
    })

    await expect(healingBox.flushOne("case-1", "preop")).resolves.toEqual({
      result: "saved",
      response: { preopUpdatedAt: "t-new" },
    })
    expect(bases).toEqual(["stale-base", "server-t1"])
    expect(await healingBox.load("case-1", "preop")).toBeNull() // tray drained
  })

  it("a still-conflicting flush keeps the patch but adopts the newer base", async () => {
    const box = createCaseOutbox({
      kv,
      sendPatch: sendPatch.mockRejectedValue(new HttpError(409)),
      classifyError: () => ({ kind: "http", status: 409, serverUpdatedAt: "server-t2" }),
    })
    await box.queue("case-1", "preop", { asaScore: "III" }, "stale-base")

    await expect(box.flushOne("case-1", "preop")).resolves.toEqual({ result: "failed" })

    const stored = JSON.parse(kv.data.get(outboxPatchKey("case-1", "preop"))!)
    expect(stored.baseUpdatedAt).toBe("server-t2") // next pass starts from server truth
    expect(stored.payload).toEqual({ asaScore: "III" })
  })

  it("quarantines a blocked field, saves safe siblings, and retries only after an edit", async () => {
    const box = createCaseOutbox({
      kv,
      sendPatch: sendPatch.mockImplementation(async (_caseId, _section, payload) => {
        if ((payload as { diagnosis?: unknown }).diagnosis === "Ivan Petrov") throw new BlockedError()
        return { preopRevision: 2 }
      }),
      classifyError: (error) => error instanceof BlockedError
        ? { kind: "http", status: 400, blocked: blockedIssue, message: blockedIssue.message }
        : classifyError(error),
    })
    await box.queue("case-1", "preop", {
      ageYears: 55,
      diagnoses: [{ code: "K35", label: "Ivan Petrov" }],
      diagnosis: "Ivan Petrov",
      icdCode: "K35",
    }, 1)

    await expect(box.flushOne("case-1", "preop")).resolves.toMatchObject({
      result: "blocked",
      blocked: blockedIssue,
      response: { preopRevision: 2 },
      savedPayload: { ageYears: 55 },
    })
    expect(sendPatch).toHaveBeenCalledTimes(2)
    expect(await box.load("case-1", "preop")).toEqual({
      diagnoses: [{ code: "K35", label: "Ivan Petrov" }],
      diagnosis: "Ivan Petrov",
      icdCode: "K35",
    })

    await box.flushOne("case-1", "preop")
    expect(sendPatch).toHaveBeenCalledTimes(2)

    await box.queue("case-1", "preop", { weightKg: 80 }, 2)
    await box.flushOne("case-1", "preop")
    expect(sendPatch).toHaveBeenLastCalledWith("case-1", "preop", { weightKg: 80 }, 2)
    expect(await box.load("case-1", "preop")).toMatchObject({ diagnosis: "Ivan Petrov" })

    await box.queue("case-1", "preop", {
      diagnoses: [{ code: "K35", label: "Acute appendicitis" }],
      diagnosis: "Acute appendicitis",
      icdCode: "K35",
    }, 2)
    await expect(box.flushOne("case-1", "preop")).resolves.toMatchObject({ result: "saved" })
    expect(await box.load("case-1", "preop")).toBeNull()
  })

  it("preserves quarantine metadata when the safe remainder conflicts then fails", async () => {
    let call = 0
    const box = createCaseOutbox({
      kv,
      sendPatch: sendPatch.mockImplementation(async () => {
        call += 1
        if (call === 1) throw new BlockedError()
        if (call === 2) throw new HttpError(409)
        if (call === 3) throw new NetworkError()
        return { preopRevision: 3 }
      }),
      classifyError: (error) =>
        error instanceof BlockedError
          ? { kind: "http", status: 400, blocked: blockedIssue, message: blockedIssue.message }
          : error instanceof HttpError
            ? { kind: "http", status: error.status, serverRevision: 2 }
            : classifyError(error),
    })
    await box.queue("case-1", "preop", {
      ageYears: 55,
      diagnoses: [{ code: "K35", label: "Ivan Petrov" }],
      diagnosis: "Ivan Petrov",
      icdCode: "K35",
    }, 1)

    await expect(box.flushOne("case-1", "preop")).resolves.toEqual({ result: "failed" })
    expect(await box.blockedIssue("case-1")).toEqual(blockedIssue)
    expect(await box.load("case-1", "preop")).toEqual({
      ageYears: 55,
      diagnoses: [{ code: "K35", label: "Ivan Petrov" }],
      diagnosis: "Ivan Petrov",
      icdCode: "K35",
    })

    await expect(box.flushOne("case-1", "preop")).resolves.toMatchObject({
      result: "blocked",
      blocked: blockedIssue,
      savedPayload: { ageYears: 55 },
    })
  })

  it("flushAll tallies saved / failed / discarded separately", async () => {
    const box = outbox()
    await box.queue("case-1", "preop", { a: 1 })
    await box.queue("case-2", "postop", { b: 2 })
    await box.queue("case-3", "intraop", { c: 3 })

    sendPatch.mockImplementation(async (caseId: string) => {
      if (caseId === "case-1") return { preopUpdatedAt: "t" }
      if (caseId === "case-2") throw new HttpError(403)
      throw new NetworkError()
    })

    await expect(box.flushAll()).resolves.toEqual({ saved: 1, failed: 1, discarded: 1 })
    expect((await box.summary()).entries).toEqual([{ caseId: "case-3", section: "intraop" }])
  })

  it("flushes multiple sections of one case sequentially, in queue order", async () => {
    const box = outbox()
    await box.queue("case-1", "preop", { a: 1 })
    await box.queue("case-1", "intraop", { b: 2 })

    const order: string[] = []
    sendPatch.mockImplementation(async (_caseId: string, section: string) => {
      order.push(`start:${section}`)
      await new Promise<void>((resolve) => setTimeout(() => resolve(), section === "preop" ? 10 : 0))
      order.push(`end:${section}`)
      return {}
    })

    await box.flushAll()

    expect(order).toEqual(["start:preop", "end:preop", "start:intraop", "end:intraop"])
  })

  it("reconcile removes index entries whose data is gone and readopts orphaned data", async () => {
    const box = outbox()
    await box.queue("case-1", "preop", { a: 1 })
    await box.queue("case-2", "preop", { b: 2 })

    // Simulate crash inconsistencies: case-1's data vanished; case-2 also has
    // orphaned intraop data that never made it into the index.
    kv.data.delete(outboxPatchKey("case-1", "preop"))
    kv.data.set(outboxPatchKey("case-2", "intraop"), JSON.stringify({ payload: { orphan: true } }))

    await box.reconcile()

    const entries = (await box.summary()).entries
    expect(entries).toEqual(
      expect.arrayContaining([
        { caseId: "case-2", section: "preop" },
        { caseId: "case-2", section: "intraop" },
      ]),
    )
    expect(entries).toHaveLength(2)
  })

  it("clearAllForCase drops every section of one case only", async () => {
    const box = outbox()
    await box.queue("case-1", "preop", { a: 1 })
    await box.queue("case-1", "postop", { b: 2 })
    await box.queue("case-2", "preop", { c: 3 })

    await box.clearAllForCase("case-1")

    expect((await box.summary()).entries).toEqual([{ caseId: "case-2", section: "preop" }])
    expect(await box.load("case-1", "preop")).toBeNull()
  })

  it("resolves a base-timestamp thunk at execution time inside the write queue", async () => {
    const baseRef = { current: "t0" }
    const sent: Array<SectionRevision | undefined> = []
    let releaseFirst!: () => void
    const box = createCaseOutbox({
      kv,
      sendPatch: sendPatch.mockImplementation(async (_c, _s, _p, base) => {
        sent.push(base)
        if (sent.length === 1) await new Promise<void>((r) => { releaseFirst = r })
        return {}
      }),
      classifyError,
      // Serialize everything through one queue like the apps do.
      orderWrite: (() => {
        let chain: Promise<unknown> = Promise.resolve()
        return <T,>(_caseId: string, _section: CaseSection, run: () => Promise<T>): Promise<T> => {
          const next = chain.then(run)
          chain = next.catch(() => {})
          return next
        }
      })(),
    })

    const first = box.save("case-1", "intraop", { positions: ["a"] }, () => baseRef.current)
    const second = box.save("case-1", "intraop", { positions: ["a", "b"] }, () => baseRef.current)
    // While the first request is in flight the server confirms a new base.
    await new Promise((r) => setTimeout(() => r(undefined), 0))
    baseRef.current = "t1"
    releaseFirst()
    await Promise.all([first, second])

    // The second save read the base when it EXECUTED, not when it was submitted.
    expect(sent).toEqual(["t0", "t1"])
  })

  it("routes writes through orderWrite when provided", async () => {
    const seen: string[] = []
    const box = createCaseOutbox({
      kv,
      sendPatch: sendPatch.mockResolvedValue({}),
      classifyError,
      orderWrite: (caseId, section, run) => {
        seen.push(`${caseId}:${section}`)
        return run()
      },
    })

    await box.save("case-1", "intraop", { x: 1 })
    expect(seen).toEqual(["case-1:intraop"])
  })

  it("uses the v5.1 namespaced patch keys (no collision with the event journal)", () => {
    expect(OUTBOX_INDEX_KEY).toBe("lospor_pending_case_patches")
    expect(outboxPatchKey("c1", "preop")).toBe("lospor_patchq_preop_c1")
    // The historical intraop patch key collided with pendingEventsKey — the
    // new namespace must never equal the journal's key.
    expect(outboxPatchKey("c1", "intraop")).not.toBe("lospor_pending_intraop_c1")
    expect(legacyOutboxPatchKey("c1", "intraop")).toBe("lospor_pending_intraop_c1")
  })

  it("reconcile migrates legacy-key patches and leaves the event journal alone", async () => {
    const box = outbox()
    // Legacy preop patch (old app version wrote it) + index entry.
    kv.data.set(legacyOutboxPatchKey("case-1", "preop"), JSON.stringify({ payload: { asaScore: "II" }, baseUpdatedAt: "b0" }))
    kv.data.set(OUTBOX_INDEX_KEY, JSON.stringify([{ caseId: "case-1", section: "preop" }]))
    // Legacy intraop key holding an EVENTS ARRAY = the pending-events journal.
    kv.data.set(legacyOutboxPatchKey("case-2", "intraop"), JSON.stringify([{ id: "e1", ts: "t" }]))
    kv.data.set(OUTBOX_INDEX_KEY, JSON.stringify([
      { caseId: "case-1", section: "preop" },
      { caseId: "case-2", section: "intraop" },
    ]))

    await box.reconcile()

    // Patch moved to the new namespace and still loadable.
    expect(kv.data.has(legacyOutboxPatchKey("case-1", "preop"))).toBe(false)
    expect(await box.load("case-1", "preop")).toEqual({ asaScore: "II" })
    // The journal data is untouched and NOT claimed by the patch index.
    expect(kv.data.get(legacyOutboxPatchKey("case-2", "intraop"))).toBe(JSON.stringify([{ id: "e1", ts: "t" }]))
    expect((await box.summary()).entries).toEqual([{ caseId: "case-1", section: "preop" }])
  })

  it("keys()-capable storage rediscovers patches the index completely lost", async () => {
    const kvWithKeys = Object.assign(memoryKV(), {
      async keys(prefix: string) { return [...kvWithKeys.data.keys()].filter((k) => k.startsWith(prefix)) },
    })
    const box = createCaseOutbox({ kv: kvWithKeys, sendPatch: sendPatch.mockResolvedValue({}), classifyError })
    // Patch data exists but the index was wiped (multi-tab lost-update).
    kvWithKeys.data.set(outboxPatchKey("ghost-case", "postop"), JSON.stringify({ payload: { ponv: true } }))

    await box.reconcile()

    expect((await box.summary()).entries).toEqual([{ caseId: "ghost-case", section: "postop" }])
  })

  it("an intraop patch and queued intraop events for the same case no longer collide", async () => {
    const box = outbox()
    await box.queue("case-9", "intraop", { positions: ["supine"] }, "b0")
    // Simulate the event journal writing its own key for the same case.
    kv.data.set("lospor_pending_intraop_case-9", JSON.stringify([{ id: "ev1", ts: "t" }]))

    expect(await box.load("case-9", "intraop")).toEqual({ positions: ["supine"] })
    expect(kv.data.get("lospor_pending_intraop_case-9")).toBe(JSON.stringify([{ id: "ev1", ts: "t" }]))
  })

  it("notifies onChange with the fresh summary after tray mutations", async () => {
    const counts: number[] = []
    const box = createCaseOutbox({
      kv,
      sendPatch: sendPatch.mockResolvedValue({}),
      classifyError,
      onChange: (s) => { counts.push(s.count) },
    })
    // onChange is fire-and-forget; give the microtask queue a beat to settle.
    const settle = () => new Promise((r) => setTimeout(() => r(undefined), 0))
    const last = () => counts[counts.length - 1]

    await box.queue("case-1", "preop", { a: 1 })
    await settle()
    expect(last()).toBe(1)

    await box.queue("case-2", "postop", { b: 2 })
    await settle()
    expect(last()).toBe(2)

    await box.save("case-1", "preop", { a: 2 }) // success clears the queued patch
    await settle()
    expect(last()).toBe(1)

    await box.clearAll()
    await settle()
    expect(last()).toBe(0)
  })
})
