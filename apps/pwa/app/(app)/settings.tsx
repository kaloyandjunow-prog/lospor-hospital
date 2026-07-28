import { useCallback, useEffect, useState } from "react"
import {
  View, Linking, Platform, ScrollView, Text, Switch,
  TouchableOpacity, TextInput, Modal, FlatList, ActivityIndicator,
} from "react-native"
import * as SecureStore from "expo-secure-store"
import Constants from "expo-constants"
import { Stack, useRouter, type Href } from "expo-router"
import { useAuth } from "@/lib/auth-context"
import {
  API_BASE, apiFetch, apiJson, decodeTokenPayload,
  getLastApiError, getLastOkRequest, getToken, isTokenExpired,
} from "@/lib/api"
import { notify, confirmAction } from "@/lib/notify"
import { flushAllQueuedCasePatches, getQueuedCasePatchSummary } from "@/lib/offline-case-patches"
import { getDroppedIntraopEvents } from "@/lib/pending-intraop-events"
import { clearLocalClinicalCache } from "@/lib/local-clinical-cache"
import { usePreferences } from "@/lib/preferences-context"
import { ensurePermission, presentNow, getStatus, type NotifStatus } from "@/lib/notifications"
import { REMINDERS_KEY, VITALS_INTERVAL_KEY, DEFAULT_INTERVAL_MIN } from "@/lib/use-case-reminders"
import { Card, SectionHeader, SettingsRow } from "@/components/ui"
import { colors, withAlpha } from "@/theme/colors"
import { AppHeader } from "@/components/AppHeader"
import { MedicalDisclaimer } from "@/components/MedicalDisclaimer"
import { useOptionLibrary, type LibraryOption } from "@/lib/use-option-library"
import { displayClinicalCode, displayOption } from "@/lib/clinical-display"
import { hospitalWebUrl } from "@/lib/hospital-links"
import {
  optionMatchesPreference,
  optionPreferenceKey,
  resolveOptionPreferenceLabels,
  type LibraryCategory,
} from "@lospor/core/option-contracts"

// --- Types --------------------------------------------------------------------

type Institution = { id: string; name: string; city: string }

type ProfileData = {
  firstName?: string | null
  lastName?: string | null
  title?: string | null
  role?: string | null
  institution?: Institution | null
}

// --- Institution picker modal -------------------------------------------------

function InstitutionPicker({
  visible,
  current,
  onClose,
  onSelect,
  searchLabel,
}: {
  visible: boolean
  current?: Institution | null
  onClose: () => void
  onSelect: (inst: Institution | null) => void
  searchLabel: string
}) {
  const [query, setQuery]   = useState("")
  const [all, setAll]       = useState<Institution[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!visible) return
    setQuery("")
    setLoading(true)
    apiJson<Institution[]>("/api/institutions")
      .then(setAll)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [visible])

  const filtered = query.length >= 1
    ? all.filter(i => `${i.name} ${i.city}`.toLowerCase().includes(query.toLowerCase()))
    : all

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: 20, paddingBottom: 40, maxHeight: "80%",
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>
              {searchLabel}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: colors.textMuted, fontSize: 20 }}>×</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={searchLabel}
            placeholderTextColor={colors.textMuted}
            autoFocus
            style={{
              backgroundColor: colors.background, color: colors.textPrimary,
              borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
              fontSize: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12,
            }}
          />
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={i => i.id}
              renderItem={({ item }) => {
                const selected = current?.id === item.id
                return (
                  <TouchableOpacity
                    onPress={() => onSelect(item)}
                    style={{
                      paddingVertical: 12, paddingHorizontal: 4,
                      borderBottomWidth: 1, borderBottomColor: colors.border,
                      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    }}
                  >
                    <View>
                      <Text style={{ color: selected ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: selected ? "700" : "500" }}>
                        {item.name}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.city}</Text>
                    </View>
                    {selected && <Text style={{ color: colors.primary, fontSize: 16 }}>✓</Text>}
                  </TouchableOpacity>
                )
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  )
}

function FavouritePicker({
  visible,
  title,
  category,
  options,
  selected,
  onClose,
  onSave,
}: {
  visible: boolean
  title: string
  category: LibraryCategory
  options: LibraryOption[]
  selected: string[]
  onClose: () => void
  onSave: (next: string[]) => void
}) {
  const { t, language } = usePreferences()
  const [query, setQuery] = useState("")
  const [draft, setDraft] = useState<string[]>(selected)

  useEffect(() => {
    if (!visible) return
    setQuery("")
    setDraft(selected)
  }, [selected, visible])

  const filtered = query.trim()
    ? options.filter(o => `${o.label} ${displayOption(category, o, language)} ${o.group ?? ""} ${o.group ? displayClinicalCode("optionGroup", o.group, language, { label: o.group }) : ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  function toggle(option: LibraryOption) {
    setDraft(previous => {
      const alreadySelected = previous.some(preference =>
        optionMatchesPreference(category, option, preference),
      )
      const withoutOption = previous.filter(preference =>
        !optionMatchesPreference(category, option, preference),
      )
      return alreadySelected
        ? withoutOption
        : previous.length >= 8
          ? previous
          : [...withoutOption, optionPreferenceKey(category, option)]
    })
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: 20, paddingBottom: 40, maxHeight: "86%",
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <View>
              <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "800" }}>{title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{draft.length}/8 selected</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: colors.textMuted, fontSize: 20 }}>x</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("searchPlaceholderShort")}
            placeholderTextColor={colors.textMuted}
            style={{
              backgroundColor: colors.background, color: colors.textPrimary,
              borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
              fontSize: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12,
            }}
          />
          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const checked = draft.some(preference =>
                optionMatchesPreference(category, item, preference),
              )
              return (
                <TouchableOpacity
                  onPress={() => toggle(item)}
                  style={{
                    paddingVertical: 11,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: checked ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: checked ? "800" : "500" }}>
                      {displayOption(category, item, language)}
                    </Text>
                    {item.group ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>{displayClinicalCode("optionGroup", item.group, language, { label: item.group })}</Text> : null}
                  </View>
                  <Text style={{ color: checked ? colors.primary : colors.textMuted, fontSize: 16, fontWeight: "900" }}>
                    {checked ? "Selected" : "+"}
                  </Text>
                </TouchableOpacity>
              )
            }}
          />
          <TouchableOpacity
            onPress={() => onSave(draft)}
            style={{ marginTop: 14, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: colors.primary }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>{t("saveFavourites")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
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
  async function loadProfile() {
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
  }

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
    loadProfile()
    loadAutomation()
    refreshDiagnostics()
  }, [loadAutomation])

  async function retryQueuedSaves() {
    await flushAllQueuedCasePatches()
    await refreshDiagnostics()
  }

  async function clearClinicalCache() {
    const run = async () => {
      const cleared = await clearLocalClinicalCache()
      await refreshDiagnostics()
      notify(
        "Local clinical cache cleared",
        `Removed ${cleared.drafts} draft(s), ${cleared.patches} queued save(s), and ${cleared.intraopQueues} intraoperative queue(s) from this device.`
      )
    }
    if (Platform.OS === "web") { await run(); return }
    void confirmAction(
      "Clear local clinical cache?",
      "This removes offline drafts and queued clinical saves from this device only. Synced cases in the server database are not deleted.",
      { destructive: true, confirmLabel: "Clear cache", cancelLabel: t("cancel") },
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
        setNotifMsg(status.reason ?? "Notifications aren't available here.")
        return
      }
      const ok = await ensurePermission()
      refreshNotifStatus()
      if (!ok) {
        setNotifMsg("Permission was not granted. Allow notifications for LOSPOR in your device/browser settings, then try again.")
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
      setNotifMsg(status.reason ?? "Notifications aren't available here.")
      return
    }
    const ok = await ensurePermission()
    refreshNotifStatus()
    if (!ok) {
      setNotifMsg("Permission was not granted. Allow notifications for LOSPOR in your device/browser settings first.")
      return
    }
    await presentNow("LOSPOR", "Test notification — reminders are working.")
    setNotifMsg("Sent. If you didn't see it, check your device/browser notification settings for this site.")
  }

  // -- Institution update -------------------------------------------------------
  async function handleSelectInstitution(inst: Institution | null) {
    setPickerOpen(false)
    setInstitutionSaving(true)
    try {
      const res = await apiFetch("/api/user", {
        method: "PATCH",
        body: JSON.stringify({ institutionId: inst?.id ?? "" }),
      })
      if (!res.ok) throw new Error()
      setProfile(prev => prev ? { ...prev, institution: inst } : prev)
    } catch {
      notify(t("error"), "Could not update institution.")
    } finally {
      setInstitutionSaving(false)
    }
  }

  async function saveFavouriteDrugs(next: string[]) {
    setDrugFavOpen(false)
    try {
      await setIntraopFavouriteDrugs(next)
    } catch {
      notify(t("error"), "Could not save favourite drugs.")
    }
  }

  async function saveFavouriteInfusions(next: string[]) {
    setInfFavOpen(false)
    try {
      await setIntraopFavouriteInfusions(next)
    } catch {
      notify(t("error"), "Could not save favourite infusions.")
    }
  }

  // -- Sign-out / delete --------------------------------------------------------
  function handleSignOut() {
    void confirmAction(t("signOutConfirmTitle"), t("signOutConfirmMsg"), { destructive: true, confirmLabel: t("signOut"), cancelLabel: t("cancel") })
      .then(ok => { if (ok) logout() })
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

  const isAdmin = (profile?.role ?? diag?.role) === "ADMIN"

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
                Name
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
                  Institution
                </Text>
                {institutionSaving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500" }}>
                    {profile?.institution?.name ?? t("noInstitution")}
                    {profile?.institution?.city ? ` · ${profile.institution.city}` : ""}
                  </Text>
                )}
              </View>
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

            {/* View profile — not yet implemented */}
            <View style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: "500" }}>
                {t("viewProfile")}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{t("comingSoon")}</Text>
            </View>
          </Card>

          {/* Settings nav row */}
          <SectionHeader title=" " />
          <Card>
            <SettingsRow
              label={t("settings")}
              subtitle={t("uiAutomationPrivacySubtitle")}
              onPress={() => setView("settings")}
            />
            {isAdmin && (
              <SettingsRow
                label={t("adminConsole")}
                subtitle={t("adminConsoleSub")}
                onPress={() => router.push("/(app)/admin" as Href)}
              />
            )}
            <SettingsRow
              label={t("auditLogs")}
              subtitle={t("auditLogsSub")}
              onPress={() => router.push("/(app)/audit-logs" as Href)}
              last
            />
          </Card>

          {/* Sign out — standalone destructive button */}
          <View style={{ marginTop: 32 }}>
            <TouchableOpacity
              onPress={handleSignOut}
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
            subtitle={heightUnit === "cm" ? "Centimetres (cm)" : "Inches (in)"}
            onPress={() => setHeightUnit(heightUnit === "cm" ? "in" : "cm")}
          />
          <SettingsRow
            label={t("weightLabel")}
            subtitle={weightUnit === "kg" ? "Kilograms (kg)" : "Pounds (lb)"}
            onPress={() => setWeightUnit(weightUnit === "kg" ? "lb" : "kg")}
          />
          <SettingsRow
            label={tc("temperatureLabel")}
            subtitle={temperatureUnit === "C" ? "Celsius (°C)" : "Fahrenheit (°F)"}
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
            subtitle={favouriteDrugLabels.length ? favouriteDrugLabels.join(", ") : "Choose up to 8 drugs for the intraop cockpit"}
            onPress={() => setDrugFavOpen(true)}
          />
          <SettingsRow
            label={t("favouriteInfusions")}
            subtitle={favouriteInfusionLabels.length ? favouriteInfusionLabels.join(", ") : "Choose up to 8 infusions for the intraop cockpit"}
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
              "Remind me to chart vitals during an active case" +
              (notifStatus
                ? !notifStatus.supported
                  ? "  ·  Status: not available here"
                  : notifStatus.permission === "granted" ? "  ·  Status: allowed"
                  : notifStatus.permission === "denied"  ? "  ·  Status: blocked in settings"
                  : "  ·  Status: not asked yet"
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
                  {vitalsInterval} min
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
            onPress={() => Linking.openURL(hospitalWebUrl("/privacy"))}
          />
          <SettingsRow
            label={t("terms")}
            onPress={() => Linking.openURL(hospitalWebUrl("/terms"))}
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
            onPress={() => Linking.openURL("https://docs.lospor.org")}
          />
          <SettingsRow
            label={t("reportBug")}
            subtitle={t("notYetAvailable")}
            // greyed — no onPress
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
          <SettingsRow label={t("diagApiBase")} subtitle={API_BASE} />
          <SettingsRow label={t("diagAuthToken")} subtitle={diag?.hasToken ? (diag.expired ? t("diagTokenPresentExpired") : t("diagTokenPresentValid")) : t("diagTokenMissing")} />
          <SettingsRow label={t("diagRole")} subtitle={diag?.role ?? t("diagUnknown")} />
          <SettingsRow label={t("diagInstitution")} subtitle={diag?.institution ?? t("diagUnknown")} />
          <SettingsRow label={t("diagUserId")} subtitle={diag?.userId ?? t("diagUnknown")} />
          <SettingsRow label={t("diagExpires")} subtitle={diag?.expiresAt ?? t("diagUnknown")} />
          <SettingsRow label={t("diagQueuedSaves")} subtitle={diag ? String(diag.queuedSaves) : t("diagUnknown")} onPress={retryQueuedSaves} />
          <SettingsRow label={t("diagLastOk")} subtitle={diag?.lastOk ? new Date(diag.lastOk).toLocaleString() : t("diagNoneYet")} />
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

