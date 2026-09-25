import { describe, expect, it } from "vitest"
import { ApiError } from "./api"
import { classifyPatchError, isServerRefusal } from "./autosave-manager"
import { readPreopAnswerRefusal } from "./preop-answer-refusal"

/**
 * Hospital 1.4.7: a refused preop answer came back as a bare 400 the outbox did
 * not recognise, so the patch was replayed every 15 s under "Saved locally".
 */
describe("a refused preop answer", () => {
  const body = {
    error: "UNKNOWN_NOT_ALLOWED",
    code: "PREOP_ANSWER_REFUSED",
    reason: "UNKNOWN_NOT_ALLOWED",
    field: "smoking",
    blockedKeys: ["smoking"],
  }

  it("is a blocked save naming the fields to revisit", () => {
    expect(readPreopAnswerRefusal(body)).toMatchObject({
      code: "PREOP_ANSWER_REFUSED",
      field: "smoking",
      reason: "UNKNOWN_NOT_ALLOWED",
      retryable: false,
      blockedKeys: ["smoking"],
    })
  })

  it("reaches the outbox as blocked, so only those keys are held back", () => {
    const failure = classifyPatchError(new ApiError("UNKNOWN_NOT_ALLOWED", 400, body.code, undefined, body))
    expect(failure).toMatchObject({ kind: "http", status: 400, blocked: { blockedKeys: ["smoking"] } })
  })

  it("is labelled refused, while offline, timeout and 5xx stay queued", () => {
    expect(isServerRefusal({ kind: "http", status: 400 })).toBe(true)
    expect(isServerRefusal({ kind: "http", status: 408 })).toBe(false)
    expect(isServerRefusal({ kind: "http", status: 429 })).toBe(false)
    expect(isServerRefusal({ kind: "http", status: 500 })).toBe(false)
    expect(isServerRefusal({ kind: "network" })).toBe(false)
    expect(isServerRefusal(undefined)).toBe(false)
  })

  it("ignores bodies that are not preop refusals", () => {
    expect(readPreopAnswerRefusal({ error: "Invalid request" })).toBeNull()
    expect(readPreopAnswerRefusal(null)).toBeNull()
  })
})
