"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import type { EventLogScreen } from "@lospor/core/clinical-preferences"
import { patchWebClinicalPreferences, readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"
import { ScreenSettingChoice } from "./ScreenSettingChoice"

const SCREENS: readonly EventLogScreen[] = ["smart", "legacy"]

export function EventLogScreenSetting() {
  const t = useTranslations("settings.eventLogScreen")
  const [screen, setScreen] = useState<EventLogScreen>(() => readWebClinicalPreferences().eventLogScreen ?? "smart")
  useEffect(() => {
    void syncWebClinicalPreferences().then(preferences => setScreen(preferences.eventLogScreen ?? "smart")).catch(() => {})
  }, [])
  function pick(next: EventLogScreen) {
    setScreen(next)
    void patchWebClinicalPreferences({ eventLogScreen: next })
  }
  return <ScreenSettingChoice title={t("title")} value={screen} options={SCREENS.map(value => ({ value, label: t(value) }))} onChange={value => pick(value as EventLogScreen)} testPrefix="event-log-screen" />
}
