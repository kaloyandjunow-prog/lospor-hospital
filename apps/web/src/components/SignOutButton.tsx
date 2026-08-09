"use client"

// Sign-out with offline-tray hygiene: on shared/hospital workstations the
// IndexedDB tray must not carry one user's unsynced clinical fragments into
// the next user's session (they would flush under the wrong account and 403).
// If the tray is non-empty the user is warned that signing out discards the
// queued saves; on confirm both trays are cleared before the server action
// (which revokes the session jti) runs.
import { useState } from "react"
import { LogOut } from "lucide-react"
import { useTranslations } from "next-intl"
import { caseOutbox } from "@/lib/case-outbox"
import { eventOutbox, eventOutboxCount } from "@/lib/event-outbox"
import { autosaveManager } from "@/lib/autosave-manager"
import { clearPediatricClinicalRulesCache } from "@/hooks/usePediatricClinicalRules"

export function SignOutButton() {
  const t = useTranslations()
  const [checking, setChecking] = useState(false)

  async function onClick(e: React.MouseEvent) {
    e.preventDefault()
    if (checking) return
    setChecking(true)
    try {
      const [patches, events] = await Promise.all([
        caseOutbox.summary().then((s) => s.count).catch(() => 0),
        eventOutboxCount().catch(() => 0),
      ])
      const queued = patches + events
      if (queued > 0) {
        const ok = window.confirm(t("nav.signOutQueuedWarning", { count: queued }))
        if (!ok) return
      }
      // Clear both trays so nothing clinical survives the user switch.
      await Promise.all([
        caseOutbox.clearAll().catch(() => {}),
        eventOutbox.clearAll().catch(() => {}),
        autosaveManager.eventMutations.clearAll().catch(() => {}),
        clearPediatricClinicalRulesCache().catch(() => {}),
      ])
      await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null)
      window.location.assign("/login")
    } finally {
      setChecking(false)
    }
  }

  return (
    <form>
      <button type="submit" onClick={onClick} title={t("nav.signOut")}
        className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] active:bg-slate-100 dark:active:bg-[#2a2a2a] transition-colors">
        <LogOut className="h-4 w-4" />
      </button>
    </form>
  )
}
