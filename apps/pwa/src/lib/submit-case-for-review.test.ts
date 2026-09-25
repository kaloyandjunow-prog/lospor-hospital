import { beforeEach, describe, expect, it, vi } from "vitest"

const hoisted = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock("@/lib/api", () => ({ apiFetch: hoisted.apiFetch }))

import { submitCaseForReview, submitForReviewMessage } from "./submit-case-for-review"

/** A `Response` only so far as this helper reads one. */
const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
}) as unknown as Response

beforeEach(() => vi.clearAllMocks())

describe("submitCaseForReview", () => {
  it("succeeds only on a confirmed AWAITING_REVIEW", async () => {
    hoisted.apiFetch.mockResolvedValue(reply(200, { status: "AWAITING_REVIEW" }))
    expect(await submitCaseForReview("case-1")).toEqual({ ok: true })
  })

  /**
   * The defect this return type exists for. `apiFetch` resolves on a 4xx, so
   * the empty catch this used to be caught only network failures and let every
   * refusal through as success -- and the caller then navigated to a case
   * screen that says nothing about whether a countdown is running. An
   * unsubmitted case and a submitted one were indistinguishable.
   */
  it("reports a readiness refusal, with the blockers the server named", async () => {
    hoisted.apiFetch.mockResolvedValue(reply(422, {
      error: "not complete enough to close",
      blockers: [{ code: "missing_start_time", path: ["intraop"] }],
    }))

    expect(await submitCaseForReview("case-1")).toEqual({
      ok: false,
      reason: "blocked",
      blockers: [{ code: "missing_start_time", path: ["intraop"] }],
    })
  })

  it("does not read a 200 that failed to confirm the new status as success", async () => {
    hoisted.apiFetch.mockResolvedValue(reply(200, { status: "IN_PROGRESS" }))
    expect(await submitCaseForReview("case-1")).toEqual({ ok: false, reason: "unreachable" })
  })

  it("reports an offline device rather than throwing at the caller", async () => {
    hoisted.apiFetch.mockRejectedValue(new Error("Network request failed"))
    expect(await submitCaseForReview("case-1")).toEqual({ ok: false, reason: "unreachable" })
  })

  // A 500 behind a proxy that returns HTML is not a clinical answer, so it is
  // never presented as one.
  it("treats an unparseable body as unreachable, not as a refusal", async () => {
    hoisted.apiFetch.mockResolvedValue({
      ok: false, status: 502, json: async () => { throw new Error("not json") },
    } as unknown as Response)

    expect(await submitCaseForReview("case-1")).toEqual({ ok: false, reason: "unreachable" })
  })

  // Finalised on the web while the phone was on postop: that is not the
  // server being unreachable, and saying so sent clinicians to retry.
  it("names a case finalised elsewhere instead of calling the server unreachable", async () => {
    hoisted.apiFetch.mockResolvedValue(reply(409, { error: "Case is already finalised", code: "CASE_ALREADY_FINALISED" }))
    const result = await submitCaseForReview("case-1")
    expect(result).toEqual({ ok: false, reason: "finalised" })
    expect(submitForReviewMessage(result as { ok: false; reason: "finalised" })).toBe("submitForReviewFinalised")
  })

  it("still treats an uncoded 409 as not confirmed", async () => {
    hoisted.apiFetch.mockResolvedValue(reply(409, { error: "Case must be in progress" }))
    expect(await submitCaseForReview("case-1")).toEqual({ ok: false, reason: "unreachable" })
  })
})
