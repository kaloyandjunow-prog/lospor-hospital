import { useCallback, useEffect, useState } from "react"
import {
  View, Linking, Platform, ScrollView, Text, Switch,
  TouchableOpacity, ActivityIndicator,
} from "react-native"
import * as SecureStore from "expo-secure-store"
import Constants from "expo-constants"
import { Stack, useFocusEffect, useRouter, type Href } from "expo-router"
import { useAuth } from "@/lib/auth-context"
import {
  API_BASE, apiFetch, apiJson, decodeTokenPayload,
  getLastApiError, getLastOkRequest, getToken, isTokenExpired,
} from "@/lib/api"
import { notify, confirmAction } from "@/lib/notify"
import { flushAllQueuedCasePatches, getQueuedCasePatchSummary } from "@/lib/offline-case-patches"
import { getDroppedIntraopEvents } from "@/lib/pending-intraop-events"
import { autosaveManager } from "@/lib/autosave-manager"
import { clearLocalClinicalCache } from "@/lib/local-clinical-cache"
import { usePreferences } from "@/lib/preferences-context"
import { ensurePermission, presentNow, getStatus, type NotifStatus } from "@/lib/notifications"
import { REMINDERS_KEY, VITALS_INTERVAL_KEY, DEFAULT_INTERVAL_MIN } from "@/lib/use-case-reminders"
import { Card, SectionHeader, SettingsRow } from "@/components/ui"
import { colors, withAlpha } from "@/theme/colors"
import { authorityNavigationForRole } from "@/lib/authority-navigation"
import { AppHeader } from "@/components/AppHeader"
import { MedicalDisclaimer } from "@/components/MedicalDisclaimer"
import { useOptionLibrary } from "@/lib/use-option-library"
import {
  resolveOptionPreferenceLabels,
} from "@lospor/core/option-contracts"
import { NO_INSTITUTION_ID } from "@lospor/core/account"
import { formatMessage } from "@/i18n/locale"
import { legalDocumentUrl } from "@/lib/legal-links"
import { FavouritePicker, InstitutionPicker, type Institution } from "@/components/SettingsPickers"

// --- Types --------------------------------------------------------------------

type ProfileData = {
  firstName?: string | null
  lastName?: string | null
  title?: string | null
  role?: string | null
  institution?: Institution | null
}

// --- Main screen --------------------------------------------------------------

export default function SettingsScreen() {
  const { logout } = useAuth()
  const router  = useRouter()
  const { options: drugOptions } = useOptionLibrary("INTRAOP_DRUG")
  const { options: infusionOptions } = useOptionLibrary("INTRAOP_INFUSION")
  const {
    language, setLanguage, theme, setTheme, preopLayout, setPreopLayout, t, tc,
    heightUnit, setHeightUnit, weightUnit, setWeightUnit, temperatureUnit, setTemperatureUnit, etco2Unit, setEtco2Unit,
    autoFillVitalsPreferences,
    setAutoFillVitalsPreferences,
    defaultMonitoring,
    setDefaultMonitoring,
    intraopFavouriteDrugs: favouriteDrugs,
    intraopFavouriteInfusions: favouriteInfusions,
    setIntraopFavouriteDrugs,
    setIntraopFavouriteInfusions,
  } = usePreferences()

  // Which panel is showing: "main" or the settings sub-screen
  const [view, setView] = useState<"main" | "settings">("main")

  // -- Profile ------------------------------------------------------------------
  const [profile, setProfile]             = useState<ProfileData | null>(null)
  const [pickerOpen, setPickerOpen]       = useState(false)
  const [drugFavOpen, setDrugFavOpen]     = useState(false)
  const [infFavOpen, setInfFavOpen]       = useState(false)
  const [institutionSaving, setInstitutionSaving] = useState(false)
  // A move is pending approval, not applied — shown instead of relabelling.
  const [institutionRequest, setInstitutionRequest] = useState<Institution | null>(null)

  const autoFillVitals = autoFillVitalsPreferences.enabled
  const autoFillBP = autoFillVitalsPreferences.includeBloodPressure
  const autoFillBg = autoFillVitalsPreferences.backfillOnReopen
  const favouriteDrugLabels = resolveOptionPreferenceLabels(
    "INTRAOP_DRUG",
    drugOptions,
    favouriteDrugs,
  )
  const favouriteInfusionLabels = resolveOptionPreferenceLabels(
    "INTRAOP_INFUSION",
    infusionOptions,
    favouriteInfusions,
  )

  // -- Notification reminders -------------------------------------------------
  const [remindersOn,   setRemindersOnState]   = useState(false)
  const [vitalsInterval, setVitalsIntervalState] = useState(DEFAULT_INTERVAL_MIN)
  const [notifStatus,   setNotifStatus]        = useState<NotifStatus | null>(null)
  const [notifMsg,      setNotifMsg]           = useState<string | null>(null)
  const INTERVAL_CHOICES = [3, 5, 10, 15]
  function refreshNotifStatus() { getStatus().then(setNotifStatus).catch(() => {}) }

  // -- Diagnostics --------------------------------------------------------------
  const [droppedCount, setDroppedCount] = useState(0)
  const [diag, setDiag] = useState<{
    hasToken: boolean; expired: boolean; role?: string; userId?: string
    institution?: string; expiresAt?: string
    lastOk?: string | null; lastError?: string | null; queuedSaves: number
  } | null>(null)

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

  const loadAutomation = useCallback(() => {
    SecureStore.getItemAsync(REMINDERS_KEY).then(v => setRemindersOnState(v === "on"))
    SecureStore.getItemAsync(VITALS_INTERVAL_KEY).then(v => {
      const n = Number(v); if (Number.isFinite(n) && n > 0) setVitalsIntervalState(n)
    })
    refreshNotifStatus()
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
    loadAutomation()
    refreshDiagnostics()
  }, [loadAutomation])

  useFocusEffect(useCallback(() => {
    void loadProfile()
  }, [loadProfile]))

  async function retryQueuedSaves() {
    await flushAllQueuedCasePatches()
    await refreshDiagnostics()
  }

  async function clearClinicalCache() {
    const run = async () => {
      const cleared = await clearLocalClinicalCache()
      await refreshDiagnostics()
      const detail = formatMessage(t("localCacheClearedBody"), { drafts: cleared.drafts, patches: cleared.patches, queues: cleared.intraopQueues })
      notify(t("localCacheCleared"), detail)
    }
    if (Platform.OS === "web") { await run(); return }
    void confirmAction(
      t("clearLocalCacheTitle"),
      t("clearLocalCacheBody"),
      { destructive: true, confirmLabel: t("clearCacheConfirm"), cancelLabel: t("cancel") },
    ).then(ok => { if (ok) run() })
  }

  // -- Automation setters -------------------------------------------------------
  function setAutoFillVitals(v: boolean) {
    void setAutoFillVitalsPreferences({
      enabled: v,
      includeBloodPressure: v ? autoFillBP : false,
      backfillOnReopen: v ? autoFillBg : false,
    })
  }
  function setAutoFillBP(v: boolean) {
    void setAutoFillVitalsPreferences({
      includeBloodPressure: v,
    })
  }
  function setAutoFillBg(v: boolean) {
    void setAutoFillVitalsPreferences({
      backfillOnReopen: v,
    })
  }

  // -- Notification setters -----------------------------------------------------
  async function setRemindersOn(v: boolean) {
    setNotifMsg(null)
    if (v) {
      const status = await getStatus()
      setNotifStatus(status)
      if (!status.supported) {
        setNotifMsg(t("notificationsUnavailable"))
        return
      }
      const ok = await ensurePermission()
      refreshNotifStatus()
      if (!ok) {
        setNotifMsg(t("notificationPermissionTryAgain"))
        return
      }
    }
    setRemindersOnState(v)
    SecureStore.setItemAsync(REMINDERS_KEY, v ? "on" : "off")
  }
  function cycleVitalsInterval() {
    const idx = INTERVAL_CHOICES.indexOf(vitalsInterval)
    const next = INTERVAL_CHOICES[(idx + 1) % INTERVAL_CHOICES.length]
    setVitalsIntervalState(next)
    SecureStore.setItemAsync(VITALS_INTERVAL_KEY, String(next))
  }
  async function sendTestNotification() {
    setNotifMsg(null)
    const status = await getStatus()
    setNotifStatus(status)
    if (!status.supported) {
      setNotifMsg(t("notificationsUnavailable"))
      return
    }
    const ok = await ensurePermission()
    refreshNotifStatus()
    if (!ok) {
      setNotifMsg(t("notificationPermissionSettings"))
      return
    }
    await presentNow("LOSPOR", t("testNotificationBody"))
    setNotifMsg(t("notificationSent"))
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

  async function saveFavouriteDrugs(next: string[]) {
    setDrugFavOpen(false)
    try {
      await setIntraopFavouriteDrugs(next)
    } catch {
      notify(t("error"), t("favouriteDrugsSaveFailed"))
    }
  }

  async function saveFavouriteInfusions(next: string[]) {
    setInfFavOpen(false)
    try {
      await setIntraopFavouriteInfusions(next)
    } catch {
      notify(t("error"), t("favouriteInfusionsSaveFailed"))
    }
  }

  // -- Sign-out / delete --------------------------------------------------------
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

  function handleDeleteAccount() {
    void confirmAction(t("deleteAccountTitle"), t("deleteAccountMsg"), { destructive: true, confirmLabel: t("deleteAccountConfirm"), cancelLabel: t("cancel") })
      .then(ok => { if (ok) confirmDeleteAccount() })
  }

  async function confirmDeleteAccount() {
    try {
      const res = await apiFetch("/api/user/delete", { method: "POST" })
      if (!res.ok) throw new Error()
      await logout()
    } catch {
      notify(t("error"), t("deleteAccountError"))
    }
  }

  // -- Helpers ------------------------------------------------------------------
  const displayName = [profile?.title, profile?.firstName, profile?.lastName]
    .filter(Boolean).join(" ") || "—"

  const currentRole = profile?.role ?? diag?.role
  const authorityNavigation = authorityNavigationForRole(currentRole)
  const isAdmin = authorityNavigation === "ADMINISTRATION"

  // -----------------------------------------------------------------------------
  // MAIN VIEW
  // -----------------------------------------------------------------------------
  if (view === "main") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppHeader eyebrow="LOSPOR" title={t("settings")} showNewCase={false} />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, paddingTop: 12 }}
        >
          {/* Profile card */}
          <SectionHeader title={t("profileSection")} />
          <Card>
            {/* Name */}
            <View style={{
              paddingHorizontal: 16, paddingVertical: 16,
              borderBottomWidth: 1, borderBottomColor: colors.border,
            }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
                {t("name")}
              </Text>
              <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>
                {displayName}
              </Text>
            </View>

            {/* Institution */}
            <View style={{
              paddingHorizontal: 16, paddingVertical: 14,
              borderBottomWidth: 1, borderBottomColor: colors.border,
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>
                  {t("institution")}
                </Text>
                {institutionSaving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500" }}>
                      {profile?.institution?.name ?? t("noInstitution")}
                      {profile?.institution?.city ? ` · ${profile.institution.city}` : ""}
                    </Text>
                    {institutionRequest ? (
                      <Text style={{ color: colors.warning, fontSize: 11, fontWeight: "700", marginTop: 3 }}>
                        {t("institutionRequestPendingShort")} {institutionRequest.name}
                      </Text>
                    ) : null}
                  </>
                )}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {/* Nothing to leave if you are already in Без институция. */}
                {profile?.institution?.id && profile.institution.id !== NO_INSTITUTION_ID ? (
                  <TouchableOpacity
                    onPress={handleLeaveInstitution}
                    disabled={institutionSaving}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                      borderWidth: 1, borderColor: withAlpha(colors.danger, "55"),
                      opacity: institutionSaving ? 0.4 : 1,
                    }}
                  >
                    <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>
                      {t("leaveInstitution")}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => setPickerOpen(true)}
                  disabled={institutionSaving}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                    backgroundColor: withAlpha(colors.primary, "20"),
                    borderWidth: 1, borderColor: withAlpha(colors.primary, "55"),
                    opacity: institutionSaving ? 0.4 : 1,
                  }}
                >
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
                    {t("editInstitution")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => router.push("/(app)/account" as Href)}
              style={{ paddingHorizontal: 16, paddingVertical: 14 }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>
                {t("viewProfile")}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>
                {t("editProfileSubtitle")}
              </Text>
            </TouchableOpacity>
          </Card>

          {/* Settings nav row */}
          <SectionHeader title=" " />
          <Card>
            <SettingsRow
              label={t("settings")}
              subtitle={t("uiAutomationPrivacySubtitle")}
              onPress={() => setView("settings")}
            />
            {authorityNavigation && (
              <SettingsRow
                label={t(authorityNavigation === "ADMINISTRATION" ? "adminConsole" : "departmentRequestQueue")}
                subtitle={t(authorityNavigation === "ADMINISTRATION" ? "adminConsoleSub" : "departmentRequestQueueSub")}
                onPress={() => router.push("/(app)/admin" as Href)}
              />
            )}
            {isAdmin && (
              <SettingsRow
                label={t("auditLogs")}
                subtitle={t("auditLogsSub")}
                onPress={() => router.push("/(app)/audit-logs" as Href)}
              />
            )}
            <SettingsRow
              label={t("diagnosticsTitle")}
              subtitle={t("diagnosticsSub")}
              onPress={() => router.push("/(app)/diagnostics" as Href)}
              last
            />
          </Card>

          {/* Sign out — standalone destructive button */}
          <View style={{ marginTop: 32 }}>
            <TouchableOpacity
              onPress={() => { void handleSignOut() }}
              style={{
                paddingVertical: 14, borderRadius: 14, alignItems: "center",
                backgroundColor: withAlpha(colors.danger, "15"),
                borderWidth: 1, borderColor: withAlpha(colors.danger, "55"),
              }}
            >
              <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "700" }}>
                {t("signOut")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Medical-device disclaimer — the app suggests doses/rates */}
          <View style={{ marginTop: 28 }}>
            <MedicalDisclaimer />
          </View>
        </ScrollView>

        <InstitutionPicker
          visible={pickerOpen}
          current={profile?.institution}
          onClose={() => setPickerOpen(false)}
          onSelect={handleSelectInstitution}
          searchLabel={t("institutionSearch")}
        />
      </View>
    )
  }

  // -----------------------------------------------------------------------------
  // SETTINGS SUB-SCREEN
  // -----------------------------------------------------------------------------
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader eyebrow="LOSPOR" title={t("settings")} showNewCase={false} onBack={() => setView("main")} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, paddingTop: 12 }}
      >
        {/* -- UI ----------------------------------------------------------------- */}
        <SectionHeader title={t("uiSection")} />
        <Card>
          <SettingsRow
            label={t("theme")}
            subtitle={theme === "light" ? t("lightTheme") : t("darkTheme")}
            onPress={() => setTheme(theme === "light" ? "dark" : "light")}
          />
          <SettingsRow
            label={t("language")}
            subtitle={language === "bg" ? t("bulgarian") : t("english")}
            onPress={() => setLanguage(language === "bg" ? "en" : "bg")}
          />
          <SettingsRow
            label={t("preopLayout")}
            subtitle={preopLayout === "sections" ? t("preopLayoutSections") : t("preopLayoutScroll")}
            onPress={() => setPreopLayout(preopLayout === "sections" ? "scroll" : "sections")}
            last
          />
        </Card>

        {/* -- Units of measurement ------------------------------------------------
            Display-only preferences — the database always stores the canonical
            value (cm/kg/°C/mmHg); changing these just converts what's shown and
            typed in vitals entry. Drugs, infusions, fluids, and labs are not
            affected by this section. */}
        <SectionHeader title={t("unitsOfMeasurementSection")} />
        <Card>
          <SettingsRow
            label={t("heightLabel")}
            subtitle={heightUnit === "cm" ? t("centimetres") : t("inches")}
            onPress={() => setHeightUnit(heightUnit === "cm" ? "in" : "cm")}
          />
          <SettingsRow
            label={t("weightLabel")}
            subtitle={weightUnit === "kg" ? t("kilograms") : t("pounds")}
            onPress={() => setWeightUnit(weightUnit === "kg" ? "lb" : "kg")}
          />
          <SettingsRow
            label={tc("temperatureLabel")}
            subtitle={temperatureUnit === "C" ? t("celsius") : t("fahrenheit")}
            onPress={() => setTemperatureUnit(temperatureUnit === "C" ? "F" : "C")}
          />
          <SettingsRow
            label="EtCO₂"
            subtitle={etco2Unit === "mmHg" ? "mmHg" : "kPa"}
            onPress={() => setEtco2Unit(etco2Unit === "mmHg" ? "kPa" : "mmHg")}
            last
          />
        </Card>

        {/* -- Automation --------------------------------------------------------- */}
        <SectionHeader title={t("intraoperative")} />
        <Card>
          <SettingsRow
            label={t("defaultMonitoring")}
            subtitle={defaultMonitoring === "advanced"
              ? t("defaultMonitoringAdvanced")
              : t("defaultMonitoringStandard")}
            onPress={() => {
              void setDefaultMonitoring(
                defaultMonitoring === "advanced" ? "standard" : "advanced",
              )
            }}
          />
          <SettingsRow
            label={t("favouriteBolusDrugs")}
            subtitle={favouriteDrugLabels.length ? favouriteDrugLabels.join(", ") : t("chooseFavouriteDrugs")}
            onPress={() => setDrugFavOpen(true)}
          />
          <SettingsRow
            label={t("favouriteInfusions")}
            subtitle={favouriteInfusionLabels.length ? favouriteInfusionLabels.join(", ") : t("chooseFavouriteInfusions")}
            onPress={() => setInfFavOpen(true)}
          />
          <SettingsRow
            label={t("autoFillVitals")}
            subtitle={t("autoFillVitalsSub")}
            last={!autoFillVitals}
            rightElement={
              <Switch
                value={autoFillVitals}
                onValueChange={setAutoFillVitals}
                trackColor={{ false: colors.border, true: colors.primarySoft }}
                thumbColor={autoFillVitals ? colors.primary : colors.textMuted}
              />
            }
          />
          {autoFillVitals && (
            <>
              <SettingsRow
                label={t("autoFillBpHr")}
                subtitle={t("autoFillBpHrSub")}
                rightElement={
                  <Switch
                    value={autoFillBP}
                    onValueChange={setAutoFillBP}
                    trackColor={{ false: colors.border, true: colors.primarySoft }}
                    thumbColor={autoFillBP ? colors.primary : colors.textMuted}
                  />
                }
              />
              <SettingsRow
                label={t("backgroundAutoFill")}
                subtitle={t("backgroundAutoFillSub")}
                last
                rightElement={
                  <Switch
                    value={autoFillBg}
                    onValueChange={setAutoFillBg}
                    trackColor={{ false: colors.border, true: colors.primarySoft }}
                    thumbColor={autoFillBg ? colors.primary : colors.textMuted}
                  />
                }
              />
            </>
          )}
        </Card>

        {/* -- Notifications ------------------------------------------------------ */}
        <SectionHeader title={t("notificationsSection")} />
        <Card>
          <SettingsRow
            label={t("caseReminders")}
            subtitle={
              (Platform.OS === "web"
                ? `${t("remindVitalsActiveCasePwa")}. ${t("pwaReminderLimitation")}`
                : t("remindVitalsActiveCase")) +
              (notifStatus
                ? !notifStatus.supported
                  ? t("notificationStatusUnavailable")
                  : notifStatus.permission === "granted" ? t("notificationStatusAllowed")
                  : notifStatus.permission === "denied"  ? t("notificationStatusBlocked")
                  : t("notificationStatusNotAsked")
                : "")
            }
            rightElement={
              <Switch
                value={remindersOn}
                onValueChange={setRemindersOn}
                trackColor={{ false: colors.border, true: colors.primarySoft }}
                thumbColor={remindersOn ? colors.primary : colors.textMuted}
              />
            }
          />
          {notifMsg && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>{notifMsg}</Text>
            </View>
          )}
          {remindersOn && (
            <SettingsRow
              label={t("vitalsReminderInterval")}
              subtitle={t("tapToChangeReminder")}
              onPress={cycleVitalsInterval}
              rightElement={
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 15 }}>
                  {vitalsInterval} {tc("minutesShort")}
                </Text>
              }
            />
          )}
          <SettingsRow
            label={t("sendTestNotification")}
            subtitle={t("checkNotificationsAllowed")}
            last
            onPress={sendTestNotification}
          />
        </Card>

        {/* -- Privacy & Data ----------------------------------------------------- */}
        <SectionHeader title={t("privacyData")} />
        <Card>
          <SettingsRow
            label={t("privacyPolicy")}
            onPress={() => void Linking.openURL(legalDocumentUrl("privacy", language)).catch(() => notify(t("error"), t("legalLinkFailed")))}
          />
          <SettingsRow
            label={t("terms")}
            onPress={() => void Linking.openURL(legalDocumentUrl("terms", language)).catch(() => notify(t("error"), t("legalLinkFailed")))}
          />
          <SettingsRow
            label={t("about")}
            subtitle={`LOSPOR v${Constants.expoConfig?.version ?? "?"} — ${t("aboutSubtitle")}`}
          />
          <SettingsRow
            label={droppedCount > 0 ? `${t("droppedEvents")} (${droppedCount})` : t("droppedEvents")}
            subtitle={t("droppedEventsSubtitle")}
            onPress={() => router.push("/(app)/dropped-events" as Href)}
          />
          <SettingsRow
            label={t("clearLocalCache")}
            subtitle={t("clearLocalCacheSubtitle")}
            danger
            onPress={clearClinicalCache}
          />
          <SettingsRow
            label={t("docs")}
            subtitle={t("docsSubtitle")}
            onPress={() => router.push("/(app)/help" as Href)}
          />
          <SettingsRow
            label={t("reportBug")}
            subtitle={t("reportBugSubtitle")}
            onPress={() => router.push("/(app)/support" as Href)}
          />
          <SettingsRow
            label={t("deleteAccount")}
            danger
            onPress={handleDeleteAccount}
          />
        </Card>

        {/* -- Diagnostics -------------------------------------------------------- */}
        <SectionHeader title={t("diagnostics")} />
        <Card>
          <SettingsRow label={t("diagApiBase")} subtitle={API_BASE || t("diagSameOriginApi")} />
          <SettingsRow
            label={Platform.OS === "web" ? t("diagAuthSession") : t("diagAuthToken")}
            subtitle={Platform.OS === "web"
              ? t("diagHttpOnlyCookie")
              : diag?.hasToken
                ? (diag.expired ? t("diagTokenPresentExpired") : t("diagTokenPresentValid"))
                : t("diagTokenMissing")}
          />
          <SettingsRow label={t("diagRole")} subtitle={diag?.role ?? t("diagUnknown")} />
          <SettingsRow label={t("diagInstitution")} subtitle={diag?.institution ?? t("diagUnknown")} />
          <SettingsRow label={t("diagUserId")} subtitle={diag?.userId ?? t("diagUnknown")} />
          <SettingsRow label={t("diagExpires")} subtitle={diag?.expiresAt ?? t("diagUnknown")} />
          <SettingsRow label={t("diagQueuedSaves")} subtitle={diag ? String(diag.queuedSaves) : t("diagUnknown")} onPress={retryQueuedSaves} />
          <SettingsRow label={t("diagLastOk")} subtitle={diag?.lastOk ? new Date(diag.lastOk).toLocaleString(language === "bg" ? "bg-BG" : "en-GB") : t("diagNoneYet")} />
          <SettingsRow label={t("diagLastError")} subtitle={diag?.lastError ?? t("diagNone")} onPress={refreshDiagnostics} last />
          <Text style={{ color: colors.textMuted, fontSize: 11, paddingHorizontal: 16, paddingBottom: 12 }}>
            {t("diagRefreshHint")}
          </Text>
        </Card>
      </ScrollView>
      <FavouritePicker
        visible={drugFavOpen}
        title={t("favouriteBolusDrugs")}
        category="INTRAOP_DRUG"
        options={drugOptions}
        selected={favouriteDrugs}
        onClose={() => setDrugFavOpen(false)}
        onSave={saveFavouriteDrugs}
      />
      <FavouritePicker
        visible={infFavOpen}
        title={t("favouriteInfusions")}
        category="INTRAOP_INFUSION"
        options={infusionOptions}
        selected={favouriteInfusions}
        onClose={() => setInfFavOpen(false)}
        onSave={saveFavouriteInfusions}
      />
    </View>
  )
}

