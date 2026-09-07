/**
 * Reaching the case summary from postop is the clinician's deliberate "I'm
 * done with postop" action, and is what starts the closure countdown -- not
 * whichever autosave happened to complete the last field (that used to
 * promote the case automatically, before the postop form's own validation
 * had any say in it). The server re-runs the same completeness check
 * finalize() applies and is the one to say whether the case is actually
 * AWAITING_REVIEW now; a genuinely incomplete postop leaves the case
 * IN_PROGRESS with no countdown, even though the postop save itself already
 * succeeded.
 *
 * Returns the server's own `awaitingReviewAt`, never this device's clock, so
 * the displayed countdown can never disagree with the server's. `null` on
 * any refusal or network failure -- the caller shows no countdown rather
 * than guessing one.
 */
export async function submitCaseForReview(caseId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/cases/${caseId}/submit-for-review`, { method: "POST" })
    if (!res.ok) return null
    const body = await res.json().catch(() => null)
    return body?.status === "AWAITING_REVIEW" ? (body.awaitingReviewAt ?? null) : null
  } catch {
    return null
  }
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
