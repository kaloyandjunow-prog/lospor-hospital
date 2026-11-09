"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import type { MonitoringScreen } from "@lospor/core/clinical-preferences"
import { patchWebClinicalPreferences, readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"
import { ScreenSettingChoice } from "./ScreenSettingChoice"

/**
 * Which Monitoring tab this clinician sees (10.2.0): Smart selection, the default, or the
 * legacy tab as it was. The same account setting the phone shows.
 */
const SCREENS: readonly MonitoringScreen[] = ["smart", "legacy"]

export function MonitoringScreenSetting() {
  const t = useTranslations("settings.monitoringScreen")
  const [screen, setScreen] = useState<MonitoringScreen>(() => readWebClinicalPreferences().monitoringScreen ?? "smart")
  useEffect(() => {
    void syncWebClinicalPreferences().then(preferences => setScreen(preferences.monitoringScreen ?? "smart")).catch(() => {})
  }, [])
  function pick(next: MonitoringScreen) {
    setScreen(next)
    void patchWebClinicalPreferences({ monitoringScreen: next })
  }
  return <ScreenSettingChoice title={t("title")} value={screen} options={SCREENS.map(value => ({ value, label: t(value) }))} onChange={value => pick(value as MonitoringScreen)} testPrefix="monitoring-screen" />
}
