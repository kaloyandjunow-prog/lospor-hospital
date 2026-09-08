import { useState } from "react"
import { View, Linking, Platform, ScrollView, Switch } from "react-native"
import Constants from "expo-constants"
import { Stack, useRouter, type Href } from "expo-router"
import { useAuth } from "@/lib/auth-context"
import { apiFetch } from "@/lib/api"
import { notify, confirmAction } from "@/lib/notify"
import { clearLocalClinicalCache } from "@/lib/local-clinical-cache"
import { usePreferences } from "@/lib/preferences-context"
import { Card, SectionHeader, SettingsRow } from "@/components/ui"
import { colors } from "@/theme/colors"
import { AppHeader } from "@/components/AppHeader"
import { useOptionLibrary } from "@/lib/use-option-library"
import { resolveOptionPreferenceLabels } from "@lospor/core/option-contracts"
import { formatMessage } from "@/i18n/locale"
import { legalDocumentUrl } from "@/lib/legal-links"
import { FavouritePicker } from "@/components/SettingsPickers"
import { NotificationsCard } from "./NotificationsCard"
import { DiagnosticsCard, type DiagState } from "./DiagnosticsCard"

/**
 * Split out of settings.tsx: theme/units/automation/notifications/privacy/
 * diagnostics -- everything settings.tsx's "settings" sub-view showed. Reads
 * its own preferences/option-library/auth context directly rather than
 * receiving them as props; only the diagnostics snapshot is threaded in,
 * because `diag?.role` also feeds the landing screen's admin-nav visibility
 * and stays owned by the parent for that reason.
 */
export function SettingsPreferencesView({
  diag, droppedCount, refreshDiagnostics, retryQueuedSaves, onBack,
}: {
  diag: DiagState
  droppedCount: number
  refreshDiagnostics: () => Promise<void>
  retryQueuedSaves: () => Promise<void>
  onBack: () => void
}) {
  const router = useRouter()
  const { logout } = useAuth()
  const { options: drugOptions } = useOptionLibrary("INTRAOP_DRUG")
  const { options: infusionOptions } = useOptionLibrary("INTRAOP_INFUSION")
  const {
    language, setLanguage, theme, setTheme, preopLayout, setPreopLayout, t, tc,
    heightUnit, setHeightUnit, weightUnit, setWeightUnit, temperatureUnit, setTemperatureUnit, etco2Unit, setEtco2Unit, cvpUnit, setCvpUnit,
    autoFillVitalsPreferences,
    setAutoFillVitalsPreferences,
    defaultMonitoring,
    setDefaultMonitoring,
    intraopFavouriteDrugs: favouriteDrugs,
    intraopFavouriteInfusions: favouriteInfusions,
    setIntraopFavouriteDrugs,
    setIntraopFavouriteInfusions,
  } = usePreferences()

  const [drugFavOpen, setDrugFavOpen] = useState(false)
  const [infFavOpen, setInfFavOpen]   = useState(false)

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader eyebrow="LOSPOR" title={t("settings")} showNewCase={false} onBack={onBack} />

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
          />
          {/* Display only. CVP is stored and exported in mmHg either way, so
              switching this re-renders existing cases rather than altering them. */}
          <SettingsRow
            label="CVP"
            subtitle={cvpUnit === "cmH2O" ? "cmH₂O" : "mmHg"}
            onPress={() => setCvpUnit(cvpUnit === "cmH2O" ? "mmHg" : "cmH2O")}
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

        <NotificationsCard />

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

        <DiagnosticsCard diag={diag} refreshDiagnostics={refreshDiagnostics} retryQueuedSaves={retryQueuedSaves} />
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
