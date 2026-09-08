/**
 * The window between a case reaching AWAITING_REVIEW and it closing itself.
 *
 * The clinician can keep editing any section during it, finalise early to
 * print or send the record, or let it close on its own once the window
 * expires -- the same three things the case-creation wizard has always
 * offered, now decided from one server timestamp instead of a per-browser
 * local clock, so any client on any route into the case agrees on how much
 * time is left.
 *
 * Thirty minutes, the same duration as `INTRAOP_RESUME_WINDOW_MS` in
 * intraop-engine.ts -- deliberately its own constant rather than an alias of
 * that one. They are different policies (finishing a case you stepped away
 * from mid-intraop vs. the grace period after review begins) that happen to
 * agree on the number today; aliasing them would change one the moment
 * someone tuned the other for a reason specific to its own policy.
 */
export const PENDING_CLOSE_WINDOW_MS = 30 * 60 * 1000

export type PendingCloseState =
  /** Not in the window: still being documented, or already finalised. */
  | { kind: "not-applicable" }
  | { kind: "counting-down"; remainingMs: number }
  /** The window has passed; the caller should finalise now. */
  | { kind: "expired" }

export type PendingCloseInput = {
  /** ISO instant the case first became AWAITING_REVIEW, or null if it never has. */
  awaitingReviewAt: string | null | undefined
  /** ISO instant the case was finalised, or null if it has not been. */
  finalizedAt: string | null | undefined
}

/**
 * `now` is a parameter, not `Date.now()`, so a client can ask "is this
 * expired" against the instant it actually has (including one recovered from
 * a background timer) without this function's own clock skewing the answer.
 */
export function pendingCloseState(input: PendingCloseInput, now: Date): PendingCloseState {
  if (!input.awaitingReviewAt || input.finalizedAt) return { kind: "not-applicable" }
  const startedAt = new Date(input.awaitingReviewAt).getTime()
  if (Number.isNaN(startedAt)) return { kind: "not-applicable" }
  // Clamped to the policy window: a clock behind the server's (a skewed
  // device, or `awaitingReviewAt` briefly appearing "in the future" from the
  // caller's own clock) must not stretch the countdown past what the policy
  // actually grants.
  const remainingMs = Math.min(PENDING_CLOSE_WINDOW_MS, PENDING_CLOSE_WINDOW_MS - (now.getTime() - startedAt))
  return remainingMs > 0 ? { kind: "counting-down", remainingMs } : { kind: "expired" }
}
