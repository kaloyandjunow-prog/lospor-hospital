import { useEffect, useState } from "react"
import { isNurseAccountRole } from "@lospor/core/clinical-roles"
import { apiFetch } from "@/lib/api"
import { notify } from "@/lib/notify"
import { refusalReason } from "@/lib/server-message"
import { assignCaseTheatre, TheatreChangedError } from "@/lib/use-operating-theatres"

/**
 * Whether the person at the dashboard is an anaesthesia nurse (capabilities.isNurse, 10.8.0). The role comes from the account,
 * not from the cases: a nurse who is not on a theatre yet has none in her list, and must still see the nurse's dashboard.
 */
export function useViewerIsNurse(cases: unknown[]): boolean {
  const [viewerRole, setViewerRole] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    apiFetch("/api/user").then(response => response.ok ? response.json() : null).then(account => { if (alive && account?.role) setViewerRole(String(account.role)) }).catch(() => {})
    return () => { alive = false }
  }, [])
  return isNurseAccountRole(viewerRole) || cases.some(item => (item as { capabilities?: { isNurse?: boolean } }).capabilities?.isNurse === true)
}

/** What a case says about the nurses (for the menu's choices). */
export function nurseFacts(menuCase: unknown) {
  const c = menuCase as { capabilities?: { isNurse?: boolean; canAssignNurses?: boolean }; nurses?: unknown[] } | null
  return { nurse: c?.capabilities?.isNurse === true, canAssignNurses: c?.capabilities?.canAssignNurses, nursesOnCase: c?.nurses?.length }
}

/** A nurse puts herself on a case that has no nurse; true when she is on it, else the reason is said and the list shown as it is. */
export async function takeCase(caseId: string, t: (key: "error" | "actionFailed") => string): Promise<boolean> {
  try {
    const response = await apiFetch(`/api/cases/${caseId}/nurses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ take: true }) })
    if (response.ok) return true
    // Another nurse may have been put on meanwhile: say why.
    notify(t("error"), await refusalReason(response) ?? t("actionFailed"))
  } catch { notify(t("error"), t("actionFailed")) }
  return false
}

type TheatreCase = { id: string; theatre?: { id: string | null; name: string | null } | null }

/** The case's theatre (10.0.0): anyone who can open it, until intraop starts. A choice somebody else made meanwhile is shown, and who. */
export async function assignTheatreFromMenu<C extends TheatreCase>(args: {
  menuCase: C | null
  theatreId: string | null
  setActionLoading: (busy: boolean) => void
  closeMenu: () => void
  loadCases: () => Promise<unknown> | void
  setMenuCase: (update: (previous: C | null) => C | null) => void
  t: (key: "noTheatre" | "theatreLabel" | "theatreChangedMeanwhileBy" | "theatreChangedMeanwhile" | "error" | "theatreChangeFailed") => string
}): Promise<void> {
  const { menuCase, theatreId, setActionLoading, closeMenu, loadCases, setMenuCase, t } = args
  if (!menuCase) return
  setActionLoading(true)
  try {
    await assignCaseTheatre(menuCase.id, theatreId, menuCase.theatre?.id ?? null)
    closeMenu()
    await loadCases()
  } catch (err) {
    if (err instanceof TheatreChangedError) {
      const theatreName = err.current?.name ?? t("noTheatre")
      setMenuCase(prev => prev && prev.theatre ? { ...prev, theatre: { ...prev.theatre, id: err.current?.id ?? null, name: err.current?.name ?? null } } : prev)
      notify(t("theatreLabel"), (err.changedBy ? t("theatreChangedMeanwhileBy").replace("{name}", err.changedBy) : t("theatreChangedMeanwhile")).replace("{theatre}", theatreName))
      void loadCases()
      return
    }
    notify(t("error"), err instanceof Error && err.message ? err.message : t("theatreChangeFailed"))
  } finally {
    setActionLoading(false)
  }
}
