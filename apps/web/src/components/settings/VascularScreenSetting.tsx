"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import type { VascularScreen } from "@lospor/core/clinical-preferences"
import { patchWebClinicalPreferences, readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"
import { ScreenSettingChoice } from "./ScreenSettingChoice"

/**
 * Which Vascular access tab this clinician sees (10.2.0): Smart selection, the default, or the
 * legacy tab as it was. The same account setting the phone shows.
 */
const SCREENS: readonly VascularScreen[] = ["smart", "legacy"]

export function VascularScreenSetting() {
  const t = useTranslations("settings.vascularScreen")
  const [screen, setScreen] = useState<VascularScreen>(() => readWebClinicalPreferences().vascularScreen ?? "smart")
  useEffect(() => {
    void syncWebClinicalPreferences().then(preferences => setScreen(preferences.vascularScreen ?? "smart")).catch(() => {})
  }, [])
  function pick(next: VascularScreen) {
    setScreen(next)
    void patchWebClinicalPreferences({ vascularScreen: next })
  }
  return <ScreenSettingChoice title={t("title")} value={screen} options={SCREENS.map(value => ({ value, label: t(value) }))} onChange={value => pick(value as VascularScreen)} testPrefix="vascular-screen" />
}
