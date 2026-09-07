import { apiFetch } from "@/lib/api"

/**
 * Reaching the case screen from postop is the clinician's deliberate "I'm
 * done" action and is what should start the closure countdown, not whichever
 * autosave happened to complete the last field. The server re-runs the same
 * completeness check finalize() applies, so a refusal is a clinical answer --
 * an incomplete preoperative assessment, no intraoperative record -- and not a
 * technicality.
 *
 * It used to be fire-and-forget, on the reasoning that the case screen reads
 * the case fresh from the server anyway. That is true of the *status*, and not
 * of anything the clinician would notice: nothing on that screen says "no
 * countdown is running", so a case still IN_PROGRESS looked exactly like one
 * submitted. `apiFetch` also resolves on a 4xx, so the empty catch here was
 * only ever catching the network, and every refusal passed through as success.
 */

export type SubmitForReviewBlocker = { code: string; path?: string[] }

export type SubmitForReviewResult =
  | { ok: true }
  /** The server read the case and refused it: incomplete documentation. */
  | { ok: false; reason: "blocked"; blockers: SubmitForReviewBlocker[] }
  /** No answer, or one that did not confirm the new status. */
  | { ok: false; reason: "unreachable" }

export async function submitCaseForReview(id: string): Promise<SubmitForReviewResult> {
  let res: Response
  try {
    res = await apiFetch(`/api/cases/${id}/submit-for-review`, { method: "POST" })
  } catch {
    return { ok: false, reason: "unreachable" }
  }

  const body = await res.json().catch(() => null)
  if (res.ok && body?.status === "AWAITING_REVIEW") return { ok: true }
  // 422 is the readiness refusal and carries the blockers. Anything else that
  // is not a confirmed AWAITING_REVIEW is reported as unreachable rather than
  // guessed at.
  if (res.status === 422 && Array.isArray(body?.blockers)) {
    return { ok: false, reason: "blocked", blockers: body.blockers }
  }
  return { ok: false, reason: "unreachable" }
}

/**
 * What to tell the clinician about a refusal. Here rather than at the call site
 * so the two reasons stay beside the code that distinguishes them.
 */
export function submitForReviewMessage(result: SubmitForReviewResult & { ok: false }): "submitForReviewBlocked" | "submitForReviewUnreachable" {
  return result.reason === "blocked" ? "submitForReviewBlocked" : "submitForReviewUnreachable"
}
