"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import type { EquipmentScreen } from "@lospor/core/clinical-preferences"
import { patchWebClinicalPreferences, readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"
import { ScreenSettingChoice } from "./ScreenSettingChoice"

/**
 * Which Equipment tab this clinician sees (10.2.0): Smart selection, the default, or the
 * legacy tab as it was. The same account setting the phone shows.
 */
const SCREENS: readonly EquipmentScreen[] = ["smart", "legacy"]

export function EquipmentScreenSetting() {
  const t = useTranslations("settings.equipmentScreen")
  const [screen, setScreen] = useState<EquipmentScreen>(() => readWebClinicalPreferences().equipmentScreen ?? "smart")
  useEffect(() => {
    void syncWebClinicalPreferences().then(preferences => setScreen(preferences.equipmentScreen ?? "smart")).catch(() => {})
  }, [])
  function pick(next: EquipmentScreen) {
    setScreen(next)
    void patchWebClinicalPreferences({ equipmentScreen: next })
  }
  return <ScreenSettingChoice title={t("title")} value={screen} options={SCREENS.map(value => ({ value, label: t(value) }))} onChange={value => pick(value as EquipmentScreen)} testPrefix="equipment-screen" />
}
