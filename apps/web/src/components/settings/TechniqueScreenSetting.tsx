"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import type { TechniqueScreen } from "@lospor/core/clinical-preferences"
import { patchWebClinicalPreferences, readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"
import { ScreenSettingChoice } from "./ScreenSettingChoice"

/**
 * Which Technique tab this clinician sees (10.2.0): Smart selection, the default, or the
 * legacy tab as it was. The same account setting the phone shows.
 */
const SCREENS: readonly TechniqueScreen[] = ["smart", "legacy"]

export function TechniqueScreenSetting() {
  const t = useTranslations("settings.techniqueScreen")
  const [screen, setScreen] = useState<TechniqueScreen>(() => readWebClinicalPreferences().techniqueScreen ?? "smart")
  useEffect(() => {
    void syncWebClinicalPreferences().then(preferences => setScreen(preferences.techniqueScreen ?? "smart")).catch(() => {})
  }, [])
  function pick(next: TechniqueScreen) {
    setScreen(next)
    void patchWebClinicalPreferences({ techniqueScreen: next })
  }
  return <ScreenSettingChoice title={t("title")} value={screen} options={SCREENS.map(value => ({ value, label: t(value) }))} onChange={value => pick(value as TechniqueScreen)} testPrefix="technique-screen" />
}
