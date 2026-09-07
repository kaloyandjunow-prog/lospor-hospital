import { apiFetch } from "@/lib/api"

/**
 * Reaching the case screen from postop is the clinician's deliberate "I'm
 * done" action and is what should start the closure countdown, not whichever
 * autosave happened to complete the last field. The server re-runs the same
 * completeness check finalize() applies; whether it agrees or not, the case
 * screen reads the case fresh from the server on its own next, so it always
 * shows the true status regardless of how this call comes back. Fire-and-
 * forget: apiFetch resolves on a 4xx/5xx, this only throws on a network
 * failure, and either way there is nothing more useful to do here than let
 * the case screen's own fetch be the source of truth.
 */
export async function submitCaseForReview(id: string): Promise<void> {
  try {
    await apiFetch(`/api/cases/${id}/submit-for-review`, { method: "POST" })
  } catch {}
}
