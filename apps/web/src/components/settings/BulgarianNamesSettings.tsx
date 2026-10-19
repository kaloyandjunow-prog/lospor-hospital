"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { BULGARIAN_NAME_SWITCH_KEYS, bulgarianNameSwitches, type BulgarianNameSwitches } from "@lospor/core/display"
import { patchWebClinicalPreferences } from "@/lib/clinical-preferences-web"
import { useBulgarianNamesVersion } from "@/hooks/useBulgarianNamesVersion"
import { SettingRow, Toggle } from "./SettingControls"

const LABEL_KEY: Record<keyof BulgarianNameSwitches, string> = {
  premed: "settings.bulgarianNamesPremed",
  drugs: "settings.bulgarianNamesDrugs",
  infusions: "settings.bulgarianNamesInfusions",
  agents: "settings.bulgarianNamesAgents",
  fluids: "settings.bulgarianNamesFluids",
}

/**
 * Settings → UI: one switch per catalogue for Bulgarian names. Saved with the
 * account's clinical preferences, so the phone follows; display only.
 */
export function BulgarianNamesSettings() {
  const t = useTranslations()
  const router = useRouter()
  useBulgarianNamesVersion()
  const [saving, setSaving] = useState(false)
  const switches = bulgarianNameSwitches()

  async function change(key: keyof BulgarianNameSwitches, value: boolean) {
    setSaving(true)
    try {
      await patchWebClinicalPreferences({ bulgarianNames: { [key]: value } })
      // Redraw the open page (chart, summary, forms) with the new names.
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pt-4 mt-2 border-t border-slate-100 dark:border-[#2a2a2a]" data-testid="bulgarian-names-settings" aria-busy={saving}>
      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{t("settings.bulgarianNames")}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{t("settings.bulgarianNamesDesc")}</p>
      {BULGARIAN_NAME_SWITCH_KEYS.map(key => (
        <SettingRow key={key} label={t(LABEL_KEY[key])}>
          <span data-testid={`bulgarian-names-${key}`}>
            <Toggle value={switches[key]} onChange={value => void change(key, value)} />
          </span>
        </SettingRow>
      ))}
    </div>
  )
}
