import { describe, expect, it, vi } from "vitest"
import { CentralApiError } from "./central-client"

// @/lib/prisma (imported by delivery-worker.ts) imports "server-only", which
// throws outside a Server Component; releaseOutcome touches no database.
vi.mock("server-only", () => ({}))

const { releaseOutcome } = await import("./delivery-worker")

/**
 * releaseOutcome decides what a failed delivery attempt becomes: RETRY (the
 * worker tries again on backoff) or CANCELLED (a person has to look at it).
 * Getting this wrong in either direction is a real production failure mode:
 * treating a permanent refusal as retryable burns a sequence number every
 * attempt, forever; treating a transient one as permanent strands a
 * perfectly deliverable batch.
 */
describe("releaseOutcome", () => {
  it("cancels on a CentralApiError explicitly marked not retryable", () => {
    const error = new CentralApiError(422, "MANIFEST_INVALID", false, "Malformed manifest")
    const outcome = releaseOutcome(error, 3)
    expect(outcome).toEqual({
      status: "CANCELLED",
      nextAttemptAt: null,
      errorCode: "MANIFEST_INVALID",
      errorMessage: "Malformed manifest",
    })
  })

  it("retries a CentralApiError explicitly marked retryable", () => {
    const error = new CentralApiError(503, "CENTRAL_UNAVAILABLE", true, "Try again later")
    const outcome = releaseOutcome(error, 0)
    expect(outcome.status).toBe("RETRY")
    expect(outcome.nextAttemptAt).toBeInstanceOf(Date)
    expect(outcome.errorCode).toBe("CENTRAL_UNAVAILABLE")
  })

  it("retries any error that isn't a CentralApiError — never mistaken for permanent", () => {
    for (const error of [new TypeError("fetch failed"), new Error("boom"), "string", null, undefined]) {
      expect(releaseOutcome(error, 1).status).toBe("RETRY")
    }
  })

  it("labels a non-CentralApiError with the generic delivery-failure code", () => {
    const outcome = releaseOutcome(new Error("timeout"), 1)
    expect(outcome.errorCode).toBe("HOSPITAL_DELIVERY_FAILED")
    expect(outcome.errorMessage).toBe("timeout")
  })

  it("truncates an overlong error message rather than storing it unbounded", () => {
    const outcome = releaseOutcome(new Error("x".repeat(1000)), 1)
    expect(outcome.errorMessage).toHaveLength(500)
  })

  it("backs off further with a higher attempt count, capped at six hours", () => {
    const soon = releaseOutcome(new Error("boom"), 0).nextAttemptAt!.getTime()
    const later = releaseOutcome(new Error("boom"), 4).nextAttemptAt!.getTime()
    const capped = releaseOutcome(new Error("boom"), 20).nextAttemptAt!.getTime()
    const now = Date.now()
    expect(later - now).toBeGreaterThan(soon - now)
    expect(capped - now).toBeLessThanOrEqual(6 * 60 * 60 * 1000 + 1000)
  })
})
