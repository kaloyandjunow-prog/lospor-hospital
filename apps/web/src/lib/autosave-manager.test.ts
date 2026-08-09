// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"

// The module registers browser listeners and an IndexedDB-backed outbox on
// import; neither is needed to exercise the failure classifier.
vi.mock("./kv-idb", () => ({ idbKV: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }))

const { AutosaveHttpError, classifyError, isNetworkSaveError } =
  await import("./autosave-manager")

/**
 * How a failed save is classified decides what happens to the clinician's data:
 * a "network" failure is queued and retried, a 409 must carry the server's
 * revision so the stale-write guard can fire, and anything else must not be
 * mistaken for either. This repo's history includes a save path that erased
 * data, so these branches are worth pinning.
 */
describe("classifyError", () => {
  it("treats a fetch TypeError as a retryable network failure", () => {
    // fetch() rejects with TypeError when the device is offline — the case must
    // be queued, never dropped.
    expect(classifyError(new TypeError("Failed to fetch"))).toEqual({ kind: "network" })
  })

  it("carries a numeric server revision on a conflict", () => {
    const failure = classifyError(new AutosaveHttpError(409, 7))
    expect(failure).toMatchObject({ kind: "http", status: 409, serverRevision: 7 })
  })

  it("carries a timestamp revision as serverUpdatedAt, not serverRevision", () => {
    // The two are different wire shapes; conflating them breaks stale detection.
    const failure = classifyError(new AutosaveHttpError(409, "2026-08-04T10:00:00.000Z"))
    expect(failure).toMatchObject({
      kind: "http",
      status: 409,
      serverUpdatedAt: "2026-08-04T10:00:00.000Z",
    })
    expect(failure).not.toHaveProperty("serverRevision")
  })

  it("omits both when the server sent no revision", () => {
    const failure = classifyError(new AutosaveHttpError(500))
    expect(failure).toMatchObject({ kind: "http", status: 500 })
    expect(failure).not.toHaveProperty("serverRevision")
    expect(failure).not.toHaveProperty("serverUpdatedAt")
  })

  it("passes a blocked-save issue through so the reason can be shown", () => {
    const blocked = { code: "CASE_LOCKED" } as never
    expect(classifyError(new AutosaveHttpError(423, undefined, blocked)))
      .toMatchObject({ kind: "http", status: 423, blocked })
  })

  it("classifies anything unrecognised as other, never as network", () => {
    // Misreading an unknown failure as "network" would retry forever; misreading
    // it as a conflict would discard the local edit.
    for (const value of [new Error("boom"), "string", null, undefined, 42, {}]) {
      expect(classifyError(value)).toEqual({ kind: "other" })
    }
  })
})

describe("isNetworkSaveError", () => {
  it("is true only for the offline fetch failure", () => {
    expect(isNetworkSaveError(new TypeError("Failed to fetch"))).toBe(true)
    expect(isNetworkSaveError(new AutosaveHttpError(500))).toBe(false)
    expect(isNetworkSaveError(new Error("boom"))).toBe(false)
    expect(isNetworkSaveError(null)).toBe(false)
  })
})
