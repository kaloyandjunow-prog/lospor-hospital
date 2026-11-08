"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { AUTOMATION_GROUPS, personalAutomationDefaultEnabled, vitalQuestionsEnabled, type UserAutomationSwitch, type UserAutomationSwitches } from "@lospor/core/intraop-automation"
import { AUTOMATIONS, successionAutomationDef } from "@lospor/core/intraop-suggestions"
import { patchWebClinicalPreferences, readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"
import { useIntraopAutomation } from "@/lib/use-intraop-automation"
import { SettingRow, Toggle } from "./SettingControls"

/**
 * The SPS automations a clinician keeps (10.2.0). Only what the
 * hospital switched on in Status is listed: off there is off for everyone.
 * Each is on until turned off here; the same account setting the PWA shows.
 * The whole set is sent each time, so one switch never clears another.
 */
export function AutomationGroupsSetting() {
  const t = useTranslations("settings.automationGroups")
  const locale = useLocale()
  const { settings, ready, unavailable, reload, succession = [] } = useIntraopAutomation()
  const [mine, setMine] = useState<UserAutomationSwitches>(() => readWebClinicalPreferences().automationGroups ?? {})
  const [lines, setLines] = useState<Record<string, boolean>>(() => readWebClinicalPreferences().automationLines ?? {})
  useEffect(() => {
    void syncWebClinicalPreferences().then(preferences => {
      setMine(preferences.automationGroups ?? {})
      setLines(preferences.automationLines ?? {})
    }).catch(() => {})
  }, [])
  if (unavailable) {
    return (
      <div data-testid="automation-groups-unavailable" className="mt-4 rounded-lg border border-amber-300/50 bg-amber-50/60 px-3 py-2 dark:border-amber-700/50 dark:bg-amber-950/20">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{t("unavailable")}</p>
        <p className="mt-0.5 text-xs leading-snug text-amber-800/80 dark:text-amber-300/80">{t("unavailableDesc")}</p>
        <button type="button" onClick={() => void reload()} className="mt-2 rounded-md border border-amber-700/50 px-2 py-1 text-xs font-semibold text-amber-900 dark:text-amber-200">{t("retry")}</button>
      </div>
    )
  }
  if (ready === false || !settings.enabled) return null
  const offered: UserAutomationSwitch[] = [
    ...(vitalQuestionsEnabled(settings) ? ["vitalQuestions" as const] : []),
    ...AUTOMATION_GROUPS.filter(group => settings.groups[group]),
  ]
  if (offered.length === 0) return null
  function set(key: UserAutomationSwitch, on: boolean) {
    const next = { ...mine, [key]: on }
    setMine(next)
    void patchWebClinicalPreferences({ automationGroups: next })
  }
  const lineCatalog = [...new Map([...AUTOMATIONS, ...succession.map(successionAutomationDef)].map(item => [item.id, item] as const)).values()]
  const offeredLines = lineCatalog.filter(item => offered.includes(item.group) && !settings.disabled.includes(item.id))
  function setLine(id: string, on: boolean) {
    const next = { ...lines, [id]: on }
    setLines(next)
    void patchWebClinicalPreferences({ automationLines: next })
  }
  return (
    <div data-testid="automation-groups-setting">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-4 mb-1">{t("title")}</p>
      {offered.map(key => (
        <SettingRow key={key} label={t(`${key}.label`)} description={t(`${key}.desc`)}>
          <Toggle label={t(`${key}.label`)} value={mine[key] !== false} onChange={value => set(key, value)} />
        </SettingRow>
      ))}
      {offeredLines.length > 0 && <>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-4 mb-1">{t("individualTitle")}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t("individualDesc")}</p>
        {offeredLines.map((line, index) => {
          const contextHeader = line.id.startsWith("context:") && !offeredLines[index - 1]?.id.startsWith("context:")
          const vitalHeader = line.group === "vitalQuestions" && offeredLines[index - 1]?.group !== "vitalQuestions"
          return <div key={line.id}>
            {contextHeader && <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("contextLinksTitle")}</p>}
            {vitalHeader && <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("vitalLinesTitle")}</p>}
            <SettingRow label={locale === "bg" ? line.bg : line.en} description={locale === "bg" ? line.detailBg : line.detailEn}>
              <Toggle testId={`setting-automation-line-${line.id}`} label={locale === "bg" ? line.bg : line.en} value={lines[line.id] ?? personalAutomationDefaultEnabled(line.id)} onChange={value => setLine(line.id, value)} />
            </SettingRow>
          </div>
        })}
      </>}
    </div>
  )
}
