import { useCallback, useState } from "react"
import { apiFetch } from "@/lib/api"
import { autosaveManager } from "@/lib/autosave-manager"
import { notify } from "@/lib/notify"
import type { CaseData } from "@/lib/case-detail-summary"
import type { ClinicalStringKey } from "@/lib/preferences-context"

/**
 * `automatic` (the review window elapsing) stays silent on refusal -- an
 * unprompted dialog half an hour later, possibly mid-case, is not how to
 * report an incomplete case; the server sweep closes it once complete.
 */
export function useCaseFinalize(id: string, tc: (key: ClinicalStringKey) => string, setCaseData: (updater: (prev: CaseData | null) => CaseData | null) => void) {
  const [finalizing, setFinalizing] = useState(false)

  const doFinalize = useCallback(async (options: { automatic?: boolean } = {}) => {
    const complain = (message: string) => {
      if (!options.automatic) notify(tc("errorLabel"), message)
    }
    setFinalizing(true)
    try {
      await autosaveManager.flushCase(id)
      await autosaveManager.waitForCase(id)
      if (autosaveManager.getState(id).pending > 0) {
        complain(tc("pendingSyncFinalise"))
        return false
      }
      const res = await apiFetch(`/api/cases/${id}/finalize`, { method: "POST" })
      // apiFetch only throws on a network failure, so a 4xx must be checked here.
      if (!res.ok) {
        complain(tc("couldFinaliseCase"))
        return false
      }
      const body = await res.json().catch(() => null)
      setCaseData(prev => prev ? { ...prev, status: "COMPLETE", finalizedAt: body?.finalizedAt ?? new Date().toISOString() } : prev)
      return true
    } catch {
      complain(tc("couldFinaliseCase"))
      return false
    } finally {
      setFinalizing(false)
    }
  }, [id, tc, setCaseData])

  return { finalizing, doFinalize }
}
