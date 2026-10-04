import { useCallback, useState } from "react"
import { apiFetch } from "@/lib/api"
import { confirmAction, notify } from "@/lib/notify"
import type { ClinicalStringKey, usePreferences } from "@/lib/preferences-context"

/**
 * Reopening a finalised case from the case screen: confirm, ask the server,
 * reload. Split out of the case screen, which is at its size budget.
 */
export function useCaseUnfinalize(
  id: string,
  t: ReturnType<typeof usePreferences>["t"],
  tc: (key: ClinicalStringKey) => string,
  loadCase: () => Promise<unknown>,
) {
  const [unfinalizing, setUnfinalizing] = useState(false)

  const handleUnfinalize = useCallback(() => {
    void confirmAction(t("unfinalizeCase"), t("unfinalizeCaseMsg"), { destructive: true, confirmLabel: tc("actionUnfinalize"), cancelLabel: tc("cancelLabel") })
      .then(async ok => {
        if (!ok) return
        setUnfinalizing(true)
        try {
          await apiFetch(`/api/cases/${id}/unfinalize`, { method: "POST" })
          await loadCase()
        } catch {
          notify(tc("errorLabel"), t("couldNotUnfinalize"))
        } finally {
          setUnfinalizing(false)
        }
      })
  }, [id, loadCase, t, tc])

  return { unfinalizing, handleUnfinalize }
}
