import { useCallback, useEffect, useState } from "react"
import { useFocusEffect } from "expo-router"
import { useAuth } from "@/lib/auth-context"
import {
  apiFetch, apiJson, decodeTokenPayload,
  getLastApiError, getLastOkRequest, getToken, isTokenExpired,
} from "@/lib/api"
import { confirmAction } from "@/lib/notify"
import { getQueuedCasePatchSummary, flushAllQueuedCasePatches } from "@/lib/offline-case-patches"
import { getDroppedIntraopEvents } from "@/lib/pending-intraop-events"
import { autosaveManager } from "@/lib/autosave-manager"
import { usePreferences } from "@/lib/preferences-context"
import { authorityNavigationForRole } from "@/lib/authority-navigation"
import { NO_INSTITUTION_ID } from "@lospor/core/account"
import { formatMessage } from "@/i18n/locale"
import { notify } from "@/lib/notify"
import type { Institution } from "@/components/SettingsPickers"
import { SettingsMainView } from "@/components/settings/SettingsMainView"
import { SettingsPreferencesView } from "@/components/settings/SettingsPreferencesView"
import type { DiagState } from "@/components/settings/DiagnosticsCard"
import type { ProfileData } from "@/components/settings/types"

// --- Main screen --------------------------------------------------------------

export default function SettingsScreen() {
  const { logout } = useAuth()
  const { t } = usePreferences()

  // Which panel is showing: "main" or the settings sub-screen
  const [view, setView] = useState<"main" | "settings">("main")

  // -- Profile ------------------------------------------------------------------
  const [profile, setProfile]             = useState<ProfileData | null>(null)
  const [pickerOpen, setPickerOpen]       = useState(false)
  const [institutionSaving, setInstitutionSaving] = useState(false)
  // A move is pending approval, not applied — shown instead of relabelling.
  const [institutionRequest, setInstitutionRequest] = useState<Institution | null>(null)

  // -- Diagnostics --------------------------------------------------------------
  // Owned here, not by the settings sub-screen: `diag?.role` also feeds the
  // landing screen's own admin-nav visibility below.
  const [droppedCount, setDroppedCount] = useState(0)
  const [diag, setDiag] = useState<DiagState>(null)

  // -- Load on mount ------------------------------------------------------------
  const loadProfile = useCallback(async () => {
    try {
      const data = await apiJson<ProfileData>("/api/user")
      setProfile(data)
    } catch {
      // Fallback: decode from JWT (no round-trip needed for display)
      const token = await getToken()
      const p = decodeTokenPayload(token)
      if (p) {
        const institutionName = typeof p.institutionName === "string" ? p.institutionName : null
        setProfile({
          firstName: typeof p.firstName === "string" ? p.firstName : undefined,
          lastName: typeof p.lastName === "string" ? p.lastName : undefined,
          title: typeof p.title === "string" ? p.title : undefined,
          role: typeof p.role === "string" ? p.role : undefined,
          institution: institutionName
            ? { id: typeof p.institutionId === "string" ? p.institutionId : "", name: institutionName, city: "" }
            : null,
        })
      }
    }
  }, [])

  async function refreshDiagnostics() {
    const token = await getToken()
    const payload = decodeTokenPayload(token)
    setDroppedCount((await getDroppedIntraopEvents().catch(() => [])).length)
    setDiag({
      hasToken: !!token,
      expired: isTokenExpired(token),
      role: typeof payload?.role === "string" ? payload.role : undefined,
      userId: typeof payload?.id === "string" ? payload.id : undefined,
      institution: typeof payload?.institutionName === "string" ? payload.institutionName : typeof payload?.institutionId === "string" ? payload.institutionId : undefined,
      expiresAt: payload?.exp ? new Date(Number(payload.exp) * 1000).toLocaleString() : undefined,
      lastOk: await getLastOkRequest(),
      lastError: await getLastApiError(),
      queuedSaves: (await getQueuedCasePatchSummary()).count,
    })
  }

  useEffect(() => {
    refreshDiagnostics()
  }, [])

  useFocusEffect(useCallback(() => {
    void loadProfile()
  }, [loadProfile]))

  async function retryQueuedSaves() {
    await flushAllQueuedCasePatches()
    await refreshDiagnostics()
  }

  // -- Institution change request -----------------------------------------------
  //
  // This used to PATCH /api/user with institutionId and then relabel the row as
  // though it had worked. That endpoint refuses the field on purpose:
  // institutional membership is what lets a head of department see your cases,
  // so moving needs their agreement. It now files a request and says so, rather
  // than reporting a change that never happened.
  async function handleSelectInstitution(inst: Institution | null) {
    setPickerOpen(false)
    if (!inst?.id) return
    setInstitutionSaving(true)
    try {
      const res = await apiFetch("/api/user/institution-request", {
        method: "POST",
        body: JSON.stringify({ institutionId: inst.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "")
      }
      setInstitutionRequest(inst)
      notify(t("institutionRequestSent"), t("institutionRequestPendingBody"))
    } catch {
      notify(t("error"), t("institutionRequestFailed"))
    } finally {
      setInstitutionSaving(false)
    }
  }

  // Leaving is not a request in the same sense: joining a department needs that
  // department's agreement, because approving is what lets its head see the
  // newcomer's cases. Leaving grants nobody anything, so the server applies it
  // at once. Confirmed first, because it still changes who can see the cases
  // recorded from here on.
  async function handleLeaveInstitution() {
    const ok = await confirmAction(t("leaveInstitutionTitle"), t("leaveInstitutionBody"), {
      destructive: true,
      confirmLabel: t("leaveInstitution"),
    })
    if (!ok) return
    setInstitutionSaving(true)
    try {
      const res = await apiFetch("/api/user/institution-request", {
        method: "POST",
        body: JSON.stringify({ institutionId: NO_INSTITUTION_ID }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? "")
      const landed: Institution = body?.requestedInstitution ?? { id: NO_INSTITUTION_ID, name: t("noInstitution"), city: "" }
      setProfile(prev => (prev ? { ...prev, institution: landed } : prev))
      setInstitutionRequest(null)
      notify(t("institutionLeft"), landed.name)
    } catch {
      notify(t("error"), t("institutionRequestFailed"))
    } finally {
      setInstitutionSaving(false)
    }
  }

  // -- Sign-out -------------------------------------------------------------
  async function handleSignOut() {
    const [patches, events, mutations] = await Promise.all([
      getQueuedCasePatchSummary().then(result => result.count).catch(() => 0),
      autosaveManager.pendingEvents.totalPending().catch(() => 0),
      autosaveManager.eventMutations.total().catch(() => 0),
    ])
    const queued = patches + events + mutations
    const message = queued > 0
      ? formatMessage(t("signOutQueuedWarning"), { count: queued })
      : t("signOutConfirmMsg")
    const ok = await confirmAction(t("signOutConfirmTitle"), message, {
      destructive: true,
      confirmLabel: t("signOut"),
      cancelLabel: t("cancel"),
    })
    if (!ok) return
    try {
      await logout()
    } catch {
      notify(t("error"), t("signOutFailed"))
    }
  }

  // -- Helpers ------------------------------------------------------------------
  const displayName = [profile?.title, profile?.firstName, profile?.lastName]
    .filter(Boolean).join(" ") || "—"

  const currentRole = profile?.role ?? diag?.role
  const authorityNavigation = authorityNavigationForRole(currentRole)
  const isAdmin = authorityNavigation === "ADMINISTRATION"

  if (view === "main") {
    return (
      <SettingsMainView
        t={t}
        profile={profile}
        institutionSaving={institutionSaving}
        institutionRequest={institutionRequest}
        pickerOpen={pickerOpen}
        setPickerOpen={setPickerOpen}
        handleSelectInstitution={handleSelectInstitution}
        handleLeaveInstitution={handleLeaveInstitution}
        handleSignOut={handleSignOut}
        authorityNavigation={authorityNavigation}
        isAdmin={isAdmin}
        displayName={displayName}
        onOpenSettings={() => setView("settings")}
      />
    )
  }

  return (
    <SettingsPreferencesView
      diag={diag}
      droppedCount={droppedCount}
      refreshDiagnostics={refreshDiagnostics}
      retryQueuedSaves={retryQueuedSaves}
      onBack={() => setView("main")}
    />
  )
}
