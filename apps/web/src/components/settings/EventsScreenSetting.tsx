"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import type { EventsScreen } from "@lospor/core/clinical-preferences"
import { patchWebClinicalPreferences, readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"
import { ScreenSettingChoice } from "./ScreenSettingChoice"

/**
 * Which Event selector this clinician sees (10.2.0): Smart selection, the default, or the
 * legacy tab as it was. The same account setting the phone shows.
 */
const SCREENS: readonly EventsScreen[] = ["smart", "legacy"]

export function EventsScreenSetting() {
  const t = useTranslations("settings.eventsScreen")
  const [screen, setScreen] = useState<EventsScreen>(() => readWebClinicalPreferences().eventsScreen ?? "smart")
  useEffect(() => {
    void syncWebClinicalPreferences().then(preferences => setScreen(preferences.eventsScreen ?? "smart")).catch(() => {})
  }, [])
  function pick(next: EventsScreen) {
    setScreen(next)
    void patchWebClinicalPreferences({ eventsScreen: next })
  }
  return <ScreenSettingChoice title={t("title")} value={screen} options={SCREENS.map(value => ({ value, label: t(value) }))} onChange={value => pick(value as EventsScreen)} testPrefix="events-screen" />
}
