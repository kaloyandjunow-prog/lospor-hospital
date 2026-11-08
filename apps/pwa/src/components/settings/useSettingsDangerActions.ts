import { Platform } from "react-native"
import { apiFetch } from "@/lib/api"
import { notify, confirmAction } from "@/lib/notify"
import { clearLocalClinicalCache } from "@/lib/local-clinical-cache"
import { formatMessage } from "@/i18n/locale"

/** Clearing the local clinical cache and deleting the account: both ask first, both are hard to undo. */
export function useSettingsDangerActions({ t, refreshDiagnostics, logout }: {
  t: (key: never) => string
  refreshDiagnostics: () => Promise<void>
  logout: () => Promise<void>
}) {
  const say = t as (key: string) => string

  async function clearClinicalCache() {
    const run = async () => {
      const cleared = await clearLocalClinicalCache()
      await refreshDiagnostics()
      const detail = formatMessage(say("localCacheClearedBody"), { drafts: cleared.drafts, patches: cleared.patches, queues: cleared.intraopQueues })
      notify(say("localCacheCleared"), detail)
    }
    if (Platform.OS === "web") { await run(); return }
    void confirmAction(
      say("clearLocalCacheTitle"),
      say("clearLocalCacheBody"),
      { destructive: true, confirmLabel: say("clearCacheConfirm"), cancelLabel: say("cancel") },
    ).then(ok => { if (ok) run() })
  }

  async function confirmDeleteAccount() {
    try {
      const res = await apiFetch("/api/user/delete", { method: "POST" })
      if (!res.ok) throw new Error()
      await logout()
    } catch {
      notify(say("error"), say("deleteAccountError"))
    }
  }

  function handleDeleteAccount() {
    void confirmAction(say("deleteAccountTitle"), say("deleteAccountMsg"), { destructive: true, confirmLabel: say("deleteAccountConfirm"), cancelLabel: say("cancel") })
      .then(ok => { if (ok) confirmDeleteAccount() })
  }

  return { clearClinicalCache, handleDeleteAccount }
}
