import { beforeEach, describe, expect, it, vi } from "vitest"
import { submitCaseForReview } from "./submit-case-for-review"

/** A `Response` only so far as this helper reads one. */
const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

beforeEach(() => vi.unstubAllGlobals())

describe("submitCaseForReview", () => {
  it("succeeds only on a confirmed AWAITING_REVIEW, and carries the stamp back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(200, {
      status: "AWAITING_REVIEW", awaitingReviewAt: "2026-09-07T09:30:00.000Z",
    })))

    expect(await submitCaseForReview("case-1")).toEqual({
      ok: true, awaitingReviewAt: "2026-09-07T09:30:00.000Z",
    })
  })

  /**
   * The defect this return type exists for. Every refusal and every network
   * failure used to collapse to `null`, and the wizard advanced to the summary
   * regardless -- so a case still IN_PROGRESS with no countdown running looked
   * exactly like one that had been submitted, on the screen whose whole job is
   * to say the case is finished.
   */
  it("reports a readiness refusal, with the blockers the server named", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(422, {
      error: "not complete enough to close",
      blockers: [{ code: "missing_end_time", path: ["intraop"] }],
    })))

    expect(await submitCaseForReview("case-1")).toEqual({
      ok: false,
      reason: "blocked",
      blockers: [{ code: "missing_end_time", path: ["intraop"] }],
    })
  })

  it("does not read a 200 that failed to confirm the new status as success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(200, { status: "IN_PROGRESS" })))
    expect(await submitCaseForReview("case-1")).toEqual({ ok: false, reason: "unreachable" })
  })

  it("reports an offline browser rather than throwing at the caller", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch") }))
    expect(await submitCaseForReview("case-1")).toEqual({ ok: false, reason: "unreachable" })
  })

  // A 500 behind a proxy that returns HTML is not a clinical answer, so it is
  // never presented as one.
  it("treats an unparseable body as unreachable, not as a refusal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 502, json: async () => { throw new Error("not json") },
    })))

    expect(await submitCaseForReview("case-1")).toEqual({ ok: false, reason: "unreachable" })
  })
})
