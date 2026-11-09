"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import type { FluidsScreen } from "@lospor/core/clinical-preferences"
import { patchWebClinicalPreferences, readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"
import { ScreenSettingChoice } from "./ScreenSettingChoice"

const SCREENS: readonly FluidsScreen[] = ["smart", "legacy"]

/** Which Fluid status tab this clinician sees: the hybrid summary or the legacy tab. */
export function FluidScreenSetting() {
  const t = useTranslations("settings.fluidsScreen")
  const [screen, setScreen] = useState<FluidsScreen>(() => readWebClinicalPreferences().fluidsScreen ?? "smart")
  useEffect(() => {
    void syncWebClinicalPreferences().then(preferences => setScreen(preferences.fluidsScreen ?? "smart")).catch(() => {})
  }, [])
  function pick(next: FluidsScreen) {
    setScreen(next)
    void patchWebClinicalPreferences({ fluidsScreen: next })
  }
  return <ScreenSettingChoice title={t("title")} value={screen} options={SCREENS.map(value => ({ value, label: t(value) }))} onChange={value => pick(value as FluidsScreen)} testPrefix="fluids-screen" />
}
