import { describe, expect, it } from "vitest"
import { PENDING_CLOSE_WINDOW_MS, pendingCloseState } from "./case-close-window"

const NOW = new Date("2026-09-06T12:00:00.000Z")
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()

describe("the pending-close window", () => {
  it("does not apply to a case that has never reached AWAITING_REVIEW", () => {
    expect(pendingCloseState({ awaitingReviewAt: null, finalizedAt: null }, NOW))
      .toEqual({ kind: "not-applicable" })
  })

  it("does not apply once the case has been finalised", () => {
    expect(pendingCloseState({
      awaitingReviewAt: minutesAgo(5),
      finalizedAt: minutesAgo(1),
    }, NOW)).toEqual({ kind: "not-applicable" })
  })

  it("counts down from the server timestamp, not from when a client opened anything", () => {
    const result = pendingCloseState({ awaitingReviewAt: minutesAgo(10), finalizedAt: null }, NOW)
    expect(result).toMatchObject({ kind: "counting-down" })
    if (result.kind === "counting-down") {
      expect(result.remainingMs).toBe(PENDING_CLOSE_WINDOW_MS - 10 * 60_000)
    }
  })

  it("is expired once the window has fully elapsed", () => {
    expect(pendingCloseState({ awaitingReviewAt: minutesAgo(31), finalizedAt: null }, NOW))
      .toEqual({ kind: "expired" })
  })

  // The boundary itself is not still counting down -- exactly zero remaining
  // means the window is over, not one more tick of "counting-down".
  it("treats exactly the window's length as expired, not as zero remaining", () => {
    const boundary = new Date(NOW.getTime() - PENDING_CLOSE_WINDOW_MS).toISOString()
    expect(pendingCloseState({ awaitingReviewAt: boundary, finalizedAt: null }, NOW))
      .toEqual({ kind: "expired" })
  })

  /**
   * A case reopened long after the window closed -- days later, say -- reads
   * as expired rather than throwing or returning some enormous negative
   * number. The caller decides what to do about an already-overdue case; this
   * only reports the fact.
   */
  it("is expired for a case reopened long after the window closed", () => {
    expect(pendingCloseState({ awaitingReviewAt: minutesAgo(60 * 24 * 3), finalizedAt: null }, NOW))
      .toEqual({ kind: "expired" })
  })

  it("does not apply for an unparsable timestamp rather than crashing", () => {
    expect(pendingCloseState({ awaitingReviewAt: "not-a-date", finalizedAt: null }, NOW))
      .toEqual({ kind: "not-applicable" })
  })

  // A skewed clock -- the caller's `now` running behind the server's, or an
  // `awaitingReviewAt` that briefly looks future-dated -- must not stretch the
  // displayed countdown past what the policy actually grants.
  it("clamps a future-looking awaitingReviewAt to the window's own length", () => {
    const future = new Date(NOW.getTime() + 5 * 60_000).toISOString()
    const result = pendingCloseState({ awaitingReviewAt: future, finalizedAt: null }, NOW)
    expect(result).toEqual({ kind: "counting-down", remainingMs: PENDING_CLOSE_WINDOW_MS })
  })
})
