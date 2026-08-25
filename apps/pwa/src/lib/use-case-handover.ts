import { useCallback, useState } from "react"
import { apiFetch, apiJson } from "@/lib/api"
import { notify } from "@/lib/notify"

// Handing a case to a colleague, and answering one that has been handed to you.
//
// Lifted out of the dashboard screen, which had grown past its size budget and
// where this was five loosely related handlers threaded through the case menu.
// It is one subject — who a case belongs to — so it lives in one place, and the
// screen keeps only the parts that draw something.

export type Colleague = { id: string; name: string; role: string }

/** What a handover did, so the caller can say the right thing about it. */
export type HandoverOutcome = "assigned" | "requested" | "failed"

// Only the keys this hook itself needs. Deliberately not `(key: string) => string`:
// the app's translator accepts its own union of keys, and would not be
// assignable to a parameter promising to handle any string at all.
type Translate = (key: "error" | "actionFailed") => string

export function useCaseHandover(translate: Translate) {
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [loadingColleagues, setLoadingColleagues] = useState(false)
  const [busy, setBusy] = useState(false)

  const failed = useCallback(() => {
    notify(translate("error"), translate("actionFailed"))
  }, [translate])

  /** Everyone this clinician may hand a case to, fetched when the sheet opens. */
  const loadColleagues = useCallback(async (): Promise<boolean> => {
    setLoadingColleagues(true)
    try {
      const data = await apiJson<Colleague[]>("/api/users/colleagues")
      setColleagues(Array.isArray(data) ? data : [])
      return true
    } catch {
      failed()
      return false
    } finally {
      setLoadingColleagues(false)
    }
  }, [failed])

  /**
   * Offers the case to `userId`.
   *
   * The server decides what that means: a head of department or an
   * administrator assigns and it moves at once, anyone else asks and it moves
   * when the recipient accepts. The outcome is returned rather than assumed, so
   * the screen can say which happened — staying silent would let a clinician
   * walk away believing they had handed over when they had only offered to.
   */
  const handOver = useCallback(async (caseId: string, userId: string): Promise<HandoverOutcome> => {
    setBusy(true)
    try {
      const response = await apiFetch(`/api/cases/${caseId}/transfer`, {
        method: "POST",
        body: JSON.stringify({ toUserId: userId }),
      })
      if (!response.ok) throw new Error()
      const body = await response.json().catch(() => ({ instant: true }))
      return body?.instant === false ? "requested" : "assigned"
    } catch {
      failed()
      return "failed"
    } finally {
      setBusy(false)
    }
  }, [failed])

  /**
   * Accepts, declines, or withdraws.
   *
   * Only the sender can withdraw and only the recipient can accept or decline;
   * the server matches on the acting user, so a case this person has no part in
   * simply has no pending transfer to resolve.
   */
  const resolveHandover = useCallback(async (
    caseId: string,
    action: "accept" | "decline" | "cancel",
  ): Promise<boolean> => {
    setBusy(true)
    try {
      const response = await apiFetch(`/api/cases/${caseId}/transfer`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      })
      if (!response.ok) throw new Error()
      return true
    } catch {
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  return { colleagues, loadingColleagues, busy, loadColleagues, handOver, resolveHandover }
}
