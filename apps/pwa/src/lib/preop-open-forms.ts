import { useEffect } from "react"

/**
 * Cases whose preoperative form is open on this device right now.
 *
 * While the form is open it saves the case itself, and it clears its local
 * draft only after a save succeeds. The background flusher used to replay that
 * draft in full as well: picked up just before the form's newer save
 * completed, the older draft landed last and put earlier values back. The
 * flusher now leaves the draft of an open form to the form, and replays it
 * once the form is closed (the draft can be the only copy of an edit whose
 * save failed before it was queued).
 */
const openForms = new Map<string, number>()

export function markPreopFormOpen(caseId: string): () => void {
  openForms.set(caseId, (openForms.get(caseId) ?? 0) + 1)
  return () => {
    const count = (openForms.get(caseId) ?? 1) - 1
    if (count > 0) openForms.set(caseId, count)
    else openForms.delete(caseId)
  }
}

export function isPreopFormOpen(caseId: string): boolean {
  return openForms.has(caseId)
}

/** Registers the preop form of `caseId` as open for as long as it is mounted. */
export function usePreopFormOpen(caseId: string | null): void {
  useEffect(() => (caseId ? markPreopFormOpen(caseId) : undefined), [caseId])
}
