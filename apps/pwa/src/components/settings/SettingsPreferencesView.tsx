import { useState } from "react"
import { View, Text, Linking } from "react-native"
import Constants from "expo-constants"
import { Stack, useRouter, type Href } from "expo-router"
import { useAuth } from "@/lib/auth-context"
import { notify } from "@/lib/notify"
import { usePreferences } from "@/lib/preferences-context"
import { BooleanSwitch, Card, SectionHeader, SettingsRow } from "@/components/ui"
import { colors } from "@/theme/colors"
import { AppHeader } from "@/components/AppHeader"
import { useOptionLibrary } from "@/lib/use-option-library"
import { resolveOptionPreferenceLabels } from "@lospor/core/option-contracts"
import { legalDocumentUrl } from "@/lib/legal-links"
import { FavouritePicker } from "@/components/SettingsPickers"
import { useSettingsDangerActions } from "./useSettingsDangerActions"
import { NotificationsCard } from "./NotificationsCard"
import { DiagnosticsCard, type DiagState } from "./DiagnosticsCard"
import { BulgarianNamesCard } from "./BulgarianNamesCard"
import { AutomationGroupsCard } from "./AutomationGroupsCard"
import { EnergyKnobSkinCard } from "./EnergyKnobSkinCard"
import { AirwayScreenCard } from "./AirwayScreenCard"
import { VascularScreenCard } from "./VascularScreenCard"
import { MonitoringScreenCard } from "./MonitoringScreenCard"
import { EquipmentScreenCard } from "./EquipmentScreenCard"
import { TechniqueScreenCard } from "./TechniqueScreenCard"
import { EventsScreenCard } from "./EventsScreenCard"
import { FluidScreenCard } from "./FluidScreenCard"
import { EventLogScreenCard } from "./EventLogScreenCard"
import { UiScaleRow } from "./UiScaleRow"
import { OverflowCueScrollView } from "@/components/intraop/OverflowCueScrollView"

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
    language, setLanguage, theme, setTheme, preopLayout, setPreopLayout, postopLayout, setPostopLayout, caseSidebar, t, tc,
    heightUnit, setHeightUnit, weightUnit, setWeightUnit, temperatureUnit, setTemperatureUnit, etco2Unit, setEtco2Unit, cvpUnit, setCvpUnit,
    autoFillVitalsPreferences,
    setAutoFillVitalsPreferences,
    defaultMonitoring,
    setDefaultMonitoring,
    intraopFavouriteDrugs: favouriteDrugs,
    intraopFavouriteInfusions: favouriteInfusions,
    setIntraopFavouriteDrugs,
    setIntraopFavouriteInfusions,
    vitalEpisodeAutoLog,
    setVitalEpisodeAutoLog,
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

  const { clearClinicalCache, handleDeleteAccount } = useSettingsDangerActions({ t: t as never, refreshDiagnostics, logout })

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


  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader eyebrow="LOSPOR" title={t("settings")} showNewCase={false} onBack={onBack} />

      <OverflowCueScrollView
        style={{ flex: 1 }}
        scrollViewStyle={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, paddingTop: 12 }}
      >
        {/* -- Profile & account -------------------------------------------------- */}
        <SectionHeader title={t("profileAccountSection")} />
        <Card>
          <SettingsRow
            label={t("viewProfile")}
            subtitle={t("profileAccountDesc")}
            onPress={() => router.push("/(app)/account" as Href)}
            last
          />
        </Card>

        {/* -- Appearance --------------------------------------------------------- */}
        <SectionHeader title={t("appearanceSection")} />
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
          <UiScaleRow />
        </Card>
        <View style={{ height: 12 }} />
        <BulgarianNamesCard />
        <View style={{ height: 12 }} />
        <EnergyKnobSkinCard />
        <SectionHeader title={t("smartFunctionsSection")} />
        <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: -4, marginBottom: 10 }}>
          {t("smartFunctionsDesc")}
        </Text>
        <Card>
          {/* Case screens can be sectioned or scrollable. Keep these choices
              with the account-wide smart section controls so layout and SPS
              settings are found together. */}
          <SettingsRow
            label={t("preopLayout")}
            subtitle={preopLayout === "sections" ? t("preopLayoutSections") : t("preopLayoutScroll")}
            onPress={() => setPreopLayout(preopLayout === "sections" ? "scroll" : "sections")}
          />
          <SettingsRow
            label={t("postopLayout")}
            subtitle={postopLayout === "sections" ? t("preopLayoutSections") : t("preopLayoutScroll")}
            onPress={() => setPostopLayout(postopLayout === "sections" ? "scroll" : "sections")}
          />
          <SettingsRow
            label={t("caseSidebarLayout")}
            subtitle={caseSidebar ? t("caseSidebarEnabled") : t("caseSidebarDisabled")}
            rightElement={<Text style={{ color: colors.textMuted, fontSize: 11 }}>{t("webOnly")}</Text>}
          />
          <AirwayScreenCard compact />
          <VascularScreenCard compact />
          <MonitoringScreenCard compact />
          <EquipmentScreenCard compact />
          <TechniqueScreenCard compact />
          <EventsScreenCard compact />
          <FluidScreenCard compact />
          <EventLogScreenCard compact />
        </Card>
        <View style={{ height: 12 }} />
        <AutomationGroupsCard />

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

        {/* -- Clinical defaults -------------------------------------------------- */}
        <SectionHeader title={t("clinicalDefaultsSection")} />
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
          {/* 10.1.0: after a yes to a vitals question, keep logging while out of range. */}
          <SettingsRow
            label={t("vitalEpisodeAutoLog")}
            subtitle={t("vitalEpisodeAutoLogSub")}
            rightElement={
              <BooleanSwitch
                testID="setting-vital-episode-auto-log"
                value={vitalEpisodeAutoLog}
                accessibilityLabel={t("vitalEpisodeAutoLog")}
                onValueChange={value => { void setVitalEpisodeAutoLog(value) }}
                trackColor={{ false: colors.border, true: colors.primarySoft }}
                thumbColor={vitalEpisodeAutoLog ? colors.primary : colors.textMuted}
              />
            }
          />
          <SettingsRow
            label={t("autoFillVitals")}
            subtitle={t("autoFillVitalsSub")}
            last={!autoFillVitals}
            rightElement={
              <BooleanSwitch
                value={autoFillVitals}
                accessibilityLabel={t("autoFillVitals")}
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
                  <BooleanSwitch
                    value={autoFillBP}
                    accessibilityLabel={t("autoFillBpHr")}
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
                  <BooleanSwitch
                    value={autoFillBg}
                    accessibilityLabel={t("backgroundAutoFill")}
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
      </OverflowCueScrollView>
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
