import { useCallback } from "react"
import { apiFetch } from "@/lib/api"
import { confirmAction, notify } from "@/lib/notify"

/** Asks, then deletes the case and leaves the screen; a failure is said, not swallowed. */
export function useCaseDelete(
  id: string,
  back: () => void,
  t: (key: "deleteCaseTitle" | "deleteCaseMsg" | "couldNotDelete") => string,
  tc: (key: "actionDelete" | "cancelLabel" | "errorLabel") => string,
) {
  return useCallback(() => {
    void confirmAction(t("deleteCaseTitle"), t("deleteCaseMsg"), { destructive: true, confirmLabel: tc("actionDelete"), cancelLabel: tc("cancelLabel") })
      .then(async ok => {
        if (!ok) return
        try {
          await apiFetch(`/api/cases/${id}`, { method: "DELETE" })
          back()
        } catch {
          notify(tc("errorLabel"), t("couldNotDelete"))
        }
      })
  }, [id, back, t, tc])
}
