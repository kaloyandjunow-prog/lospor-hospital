"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { ENERGY_KNOB_SKINS, type EnergyKnobSkin } from "@lospor/core/clinical-preferences"
import { patchWebClinicalPreferences, readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"
import { EnergyKnob } from "@/components/intraop/EnergyKnob"

/**
 * The shock knob's look (10.2.0), per profile: three live previews that can
 * be turned, and the one picked is what the shock dialog shows. The same
 * account setting the PWA shows.
 */
export function EnergyKnobSkinSetting() {
  const t = useTranslations("settings.energyKnob")
  const [skin, setSkin] = useState<EnergyKnobSkin>(() => readWebClinicalPreferences().energyKnobSkin ?? "A")
  const [energies, setEnergies] = useState<Record<EnergyKnobSkin, number>>({ A: 150, B: 150, C: 150 })
  useEffect(() => {
    void syncWebClinicalPreferences().then(preferences => setSkin(preferences.energyKnobSkin ?? "A")).catch(() => {})
  }, [])
  function pick(next: EnergyKnobSkin) {
    setSkin(next)
    void patchWebClinicalPreferences({ energyKnobSkin: next })
  }
  return (
    <div className="py-3" data-testid="energy-knob-setting">
      <p className="text-sm font-medium">{t("title")}</p>
      <p className="text-xs text-slate-500 mb-2">{t("desc")}</p>
      <div className="grid grid-cols-3 gap-2">
        {ENERGY_KNOB_SKINS.map(option => (
          <div key={option} className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 ${skin === option ? "border-amber-500" : "border-slate-200 dark:border-[#333]"}`}>
            <EnergyKnob skin={option} energy={energies[option]} size={110} testId={`energy-knob-preview-${option}`}
              onChange={value => setEnergies(prev => ({ ...prev, [option]: value }))}
              label={t(`skin${option}`)} valueText={`${energies[option]} J`} />
            <span className="font-mono text-sm font-bold tabular-nums text-amber-600">{energies[option]} J</span>
            <button type="button" aria-pressed={skin === option} data-testid={`energy-knob-pick-${option}`} onClick={() => pick(option)}
              className={`w-full rounded-lg px-2 py-1 text-xs font-semibold ${skin === option ? "bg-amber-500 text-slate-900" : "border border-slate-300 dark:border-[#444]"}`}>
              {t(`skin${option}`)}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
