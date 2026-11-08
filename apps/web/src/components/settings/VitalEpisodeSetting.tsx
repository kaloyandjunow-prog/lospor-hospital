"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { patchWebClinicalPreferences, readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"
import { SettingRow, Toggle } from "./SettingControls"

/**
 * After a yes to a question from the vitals, keep logging while the readings
 * stay out of range (10.1.0). On by default; off, every out-of-range reading
 * asks again. The same account setting the PWA shows.
 */
export function VitalEpisodeSetting() {
  const t = useTranslations("settings")
  const [on, setOn] = useState(() => readWebClinicalPreferences().vitalEpisodeAutoLog)
  useEffect(() => {
    void syncWebClinicalPreferences().then(preferences => setOn(preferences.vitalEpisodeAutoLog))
  }, [])
  return (
    <SettingRow label={t("vitalEpisodeAutoLog")} description={t("vitalEpisodeAutoLogDesc")}>
      <Toggle label={t("vitalEpisodeAutoLog")} value={on} onChange={value => { setOn(value); void patchWebClinicalPreferences({ vitalEpisodeAutoLog: value }) }} />
    </SettingRow>
  )
}
