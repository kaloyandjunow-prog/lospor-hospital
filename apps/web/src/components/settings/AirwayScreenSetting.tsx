"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import type { AirwayScreen } from "@lospor/core/clinical-preferences"
import { patchWebClinicalPreferences, readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"
import { ScreenSettingChoice } from "./ScreenSettingChoice"

/**
 * Which Airway tab this clinician sees (10.2.0): Smart selection, the default,
 * or the legacy tab as it was. The same account setting the phone shows.
 */
const SCREENS: readonly AirwayScreen[] = ["smart", "legacy"]

export function AirwayScreenSetting() {
  const t = useTranslations("settings.airwayScreen")
  const [screen, setScreen] = useState<AirwayScreen>(() => readWebClinicalPreferences().airwayScreen ?? "smart")
  useEffect(() => {
    void syncWebClinicalPreferences().then(preferences => setScreen(preferences.airwayScreen ?? "smart")).catch(() => {})
  }, [])
  function pick(next: AirwayScreen) {
    setScreen(next)
    void patchWebClinicalPreferences({ airwayScreen: next })
  }
  return <ScreenSettingChoice title={t("title")} value={screen} options={SCREENS.map(value => ({ value, label: t(value) }))} onChange={value => pick(value as AirwayScreen)} testPrefix="airway-screen" />
}
