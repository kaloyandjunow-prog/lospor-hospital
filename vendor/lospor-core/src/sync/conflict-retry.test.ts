import { describe, expect, it, vi } from "vitest"
import {
  classifyPatchResponse,
  saveWithConflictRetry,
  sendWithConflictRetry,
  type ConflictAttempt,
} from "./conflict-retry"

function ok<T>(body: T): ConflictAttempt<T> {
  return { ok: true, body }
}

function conflict(serverUpdatedAt: string | null, body?: unknown): ConflictAttempt<never> {
  return { ok: false, conflict: true, serverUpdatedAt, body }
}

describe("sendWithConflictRetry", () => {
  it("returns the first attempt when it succeeds", async () => {
    const attempt = vi.fn(async () => ok({ intraopUpdatedAt: "t1" }))
    const baseRef = { current: "client-1" }

    const outcome = await sendWithConflictRetry(attempt, baseRef)

    expect(outcome).toEqual({ ok: true, body: { intraopUpdatedAt: "t1" }, retried: false })
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(attempt).toHaveBeenCalledWith("client-1")
  })

  it("retries once with the server timestamp after a 409", async () => {
    const attempt = vi.fn()
      .mockResolvedValueOnce(conflict("server-1"))
      .mockResolvedValueOnce(ok({ intraopUpdatedAt: "server-2" }))
    const baseRef = { current: "client-1" }

    const outcome = await sendWithConflictRetry(attempt, baseRef)

    expect(outcome.ok).toBe(true)
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(attempt.mock.calls[0][0]).toBe("client-1")
    expect(attempt.mock.calls[1][0]).toBe("server-1")
    expect(baseRef.current).toBe("server-1")
  })

  it("stops after the retry if the server still reports a conflict, remembering the newest timestamp", async () => {
    const attempt = vi.fn()
      .mockResolvedValueOnce(conflict("server-1"))
      .mockResolvedValueOnce(conflict("server-2"))
    const baseRef = { current: "client-1" }

    const outcome = await sendWithConflictRetry(attempt, baseRef)

    expect(outcome).toMatchObject({ ok: false, conflict: true, retried: true })
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(baseRef.current).toBe("server-2")
  })

  it("does not retry when the policy declines the conflict body", async () => {
    const attempt = vi.fn()
      .mockResolvedValueOnce(conflict("server-1", { reason: "real_conflict" }))
    const baseRef = { current: "client-1" }

    const outcome = await sendWithConflictRetry(
      attempt,
      baseRef,
      (body) => (body as { reason?: string })?.reason === "missing_conflict_timestamp",
    )

    expect(outcome).toMatchObject({ ok: false, conflict: true, retried: false })
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(baseRef.current).toBe("client-1")
  })

  it("retries when the policy accepts the conflict body (web missing-timestamp recovery)", async () => {
    const attempt = vi.fn()
      .mockResolvedValueOnce(conflict("server-1", { reason: "missing_conflict_timestamp" }))
      .mockResolvedValueOnce(ok({ preopUpdatedAt: "server-2" }))
    const baseRef = { current: null }

    const outcome = await sendWithConflictRetry(
      attempt,
      baseRef,
      (body) => (body as { reason?: string })?.reason === "missing_conflict_timestamp",
    )

    expect(outcome.ok).toBe(true)
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it("does not retry a conflict that carries no server timestamp", async () => {
    const attempt = vi.fn().mockResolvedValueOnce(conflict(null))
    const baseRef = { current: "client-1" }

    const outcome = await sendWithConflictRetry(attempt, baseRef)

    expect(outcome).toMatchObject({ ok: false, conflict: true, retried: false })
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it("passes through non-conflict failures untouched", async () => {
    const attempt = vi.fn().mockResolvedValueOnce({ ok: false, conflict: false, status: 500 })
    const baseRef = { current: "client-1" }

    const outcome = await sendWithConflictRetry(attempt, baseRef)

    expect(outcome).toMatchObject({ ok: false, conflict: false, status: 500, retried: false })
    expect(baseRef.current).toBe("client-1")
  })
})

describe("saveWithConflictRetry", () => {
  it("adopts the echoed timestamp on success", async () => {
    const attempt = vi.fn()
      .mockResolvedValueOnce(conflict("server-1"))
      .mockResolvedValueOnce(ok({ intraopUpdatedAt: "server-2" }))
    const baseRef = { current: "client-1" }

    const outcome = await saveWithConflictRetry(
      attempt,
      baseRef,
      (body: { intraopUpdatedAt?: string }) => body.intraopUpdatedAt,
    )

    expect(outcome.ok).toBe(true)
    expect(baseRef.current).toBe("server-2")
  })

  it("keeps the adopted conflict timestamp when the response echoes none", async () => {
    const attempt = vi.fn()
      .mockResolvedValueOnce(conflict("server-1"))
      .mockResolvedValueOnce(ok({}))
    const baseRef = { current: "client-1" }

    await saveWithConflictRetry(attempt, baseRef, () => null)

    expect(baseRef.current).toBe("server-1")
  })
})

describe("classifyPatchResponse", () => {
  function response(status: number, body: unknown = {}) {
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }

  it("classifies success, conflict, and failure", async () => {
    await expect(classifyPatchResponse(response(200, { updatedAt: "t" }))).resolves.toEqual({
      ok: true,
      body: { updatedAt: "t" },
    })
    await expect(classifyPatchResponse(response(409, { serverVersion: { updatedAt: "s" } }))).resolves.toMatchObject({
      ok: false,
      conflict: true,
      serverUpdatedAt: "s",
    })
    await expect(classifyPatchResponse(response(500, { error: "x" }))).resolves.toMatchObject({
      ok: false,
      conflict: false,
      status: 500,
    })
  })

  it("survives an unparseable body", async () => {
    const res = { ok: false, status: 409, json: async () => { throw new Error("bad json") } }
    await expect(classifyPatchResponse(res)).resolves.toMatchObject({
      ok: false,
      conflict: true,
      serverUpdatedAt: null,
    })
  })
})
