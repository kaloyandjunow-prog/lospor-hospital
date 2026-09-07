/**
 * Reaching the case summary from postop is the clinician's deliberate "I'm
 * done with postop" action, and is what starts the closure countdown -- not
 * whichever autosave happened to complete the last field (that used to
 * promote the case automatically, before the postop form's own validation had
 * any say in it).
 *
 * The server runs finalize's whole readiness check, so a refusal is a real
 * clinical answer -- an incomplete preoperative assessment, a missing
 * intraoperative record -- and not a technicality. It is returned rather than
 * swallowed: this used to collapse every refusal and every network failure to
 * `null`, and the caller advanced to the summary regardless, so a case that
 * was still IN_PROGRESS with no countdown running looked exactly like one that
 * had been submitted. The clinician had no way to tell, and nothing would tell
 * them later either.
 */

export type SubmitForReviewBlocker = { code: string; path?: string[] }

export type SubmitForReviewResult =
  | { ok: true; awaitingReviewAt: string | null }
  /** The server read the case and refused it: incomplete documentation. */
  | { ok: false; reason: "blocked"; blockers: SubmitForReviewBlocker[] }
  /** The request never got an answer, or got one that made no sense. */
  | { ok: false; reason: "unreachable" }

export async function submitCaseForReview(caseId: string): Promise<SubmitForReviewResult> {
  let res: Response
  try {
    res = await fetch(`/api/cases/${caseId}/submit-for-review`, { method: "POST" })
  } catch {
    return { ok: false, reason: "unreachable" }
  }

  const body = await res.json().catch(() => null)

  if (res.ok && body?.status === "AWAITING_REVIEW") {
    return { ok: true, awaitingReviewAt: body.awaitingReviewAt ?? null }
  }
  // 422 is the readiness refusal and carries the blockers. Anything else that
  // is not a confirmed AWAITING_REVIEW is treated as unreachable rather than
  // guessed at -- the case screen re-reads the truth from the server anyway.
  if (res.status === 422 && Array.isArray(body?.blockers)) {
    return { ok: false, reason: "blocked", blockers: body.blockers }
  }
  return { ok: false, reason: "unreachable" }
}

/**
 * What to tell the clinician about a refusal. Here rather than at the call
 * site so the two reasons stay beside the code that distinguishes them.
 */
export function submitForReviewMessage(result: SubmitForReviewResult & { ok: false }): string {
  return result.reason === "blocked"
    ? "case.submitForReviewBlocked"
    : "case.submitForReviewUnreachable"
}

/** Reads back whatever the server decided after an undo re-submits postop -- see handleUndo. */
export async function refetchAwaitingReviewAt(caseId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/cases/${caseId}`)
    if (!res.ok) return null
    const record = await res.json().catch(() => null)
    return record?.status === "AWAITING_REVIEW" ? (record.awaitingReviewAt ?? null) : null
  } catch {
    return null
  }
}
