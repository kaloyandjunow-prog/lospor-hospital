"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import {
  DEFIBRILLATION_MAX_J,
  DEFIBRILLATION_MIN_J,
  clampDefibrillationEnergy,
  isValidDefibrillationEnergy,
} from "@lospor/core/defibrillation"
import type { EnergyKnobSkin } from "@lospor/core/clinical-preferences"
import { readWebClinicalPreferences, syncWebClinicalPreferences } from "@/lib/clinical-preferences-web"
import { EnergyKnob } from "./EnergyKnob"

/** The skin this clinician picked in Settings > UI (10.2.0), A until synced. */
function useEnergyKnobSkin(): EnergyKnobSkin {
  const [skin, setSkin] = useState<EnergyKnobSkin>(() => readWebClinicalPreferences().energyKnobSkin ?? "A")
  useEffect(() => {
    void syncWebClinicalPreferences().then(preferences => setSkin(preferences.energyKnobSkin ?? "A")).catch(() => {})
  }, [])
  return skin
}

/**
 * A shock on the web chart (10.1.0), the PWA's sheet in a dialog: a dial for
 * the energy (drag it, or use the arrow keys), − / + buttons, and two
 * separate buttons for synchronised or not. Synchronisation is never
 * preselected and nothing saves until both are set; a child's energy is
 * prefilled from the paediatric reference and says so.
 */
export function DefibrillationDialog({ timeLabel, shockNumber, prefillJoules, onCancel, onSave, skin: skinProp }: {
  timeLabel: string
  shockNumber: number
  prefillJoules: number | null
  onCancel: () => void
  onSave: (energyJ: number, synchronized: boolean) => void
  /** The knob's look; the clinician's own choice unless given. */
  skin?: EnergyKnobSkin
}) {
  const t = useTranslations("intraop.defibrillation")
  const [energy, setEnergy] = useState<number | null>(prefillJoules)
  const [synchronized, setSynchronized] = useState<boolean | null>(null)
  const chosenSkin = useEnergyKnobSkin()
  const skin = skinProp ?? chosenSkin
  const step = (delta: number) => setEnergy(current => clampDefibrillationEnergy((current ?? (delta > 0 ? DEFIBRILLATION_MIN_J - 1 : DEFIBRILLATION_MIN_J + 1)) + delta))
  const ready = isValidDefibrillationEnergy(energy) && synchronized != null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="defib-title" data-testid="defibrillation-dialog">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#333] p-5 space-y-4 shadow-xl">
        <h2 id="defib-title" className="text-base font-semibold text-slate-800 dark:text-slate-100">
          {t("title")} · {timeLabel} · {t("shockNumber", { n: shockNumber })}
        </h2>
        <div className="flex flex-col items-center">
          <div className="flex items-baseline gap-1 rounded-xl bg-slate-950 px-5 py-1.5" style={{ boxShadow: "inset 0 2px 8px rgba(0,0,0,.8)" }}>
            <span data-testid="defib-readout" className={`font-mono text-5xl font-black tabular-nums ${energy == null ? "text-slate-500" : "text-amber-400"}`}>{energy ?? "—"}</span>
            <span className="text-sm font-bold text-amber-700">J</span>
          </div>
          <EnergyKnob skin={skin} energy={energy} onChange={setEnergy} label={t("energy")} valueText={energy == null ? t("setEnergy") : `${energy} J`} />
          <div className="mt-2 flex gap-2">
            {[-10, -1, 1, 10].map(delta => (
              <button key={delta} type="button" data-testid={`defib-step-${delta}`} onClick={() => step(delta)}
                aria-label={`${t("energy")} ${delta > 0 ? "+" : "−"}${Math.abs(delta)}`}
                className="min-w-12 rounded-lg border border-slate-300 dark:border-[#444] px-3 py-2 text-base font-bold text-slate-700 dark:text-slate-200">
                {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">{DEFIBRILLATION_MIN_J}–{DEFIBRILLATION_MAX_J} J</p>
        </div>
        {prefillJoules != null && <p data-testid="defib-prefill-hint" className="text-xs text-amber-700 dark:text-amber-400">{t("prefillHint", { ref: `${prefillJoules} J` })}</p>}
        <div className="flex gap-2">
          {([false, true] as const).map(value => (
            <button key={String(value)} type="button" data-testid={value ? "defib-sync" : "defib-unsync"} aria-pressed={synchronized === value}
              onClick={() => setSynchronized(value)}
              className={`flex-1 rounded-xl border-2 px-3 py-3 text-sm font-bold ${synchronized === value
                ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                : "border-slate-300 dark:border-[#444] text-slate-600 dark:text-slate-300"}`}>
              {value ? t("sync") : t("unsync")}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-300 dark:border-[#444] px-3 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300">{t("cancel")}</button>
          <button type="button" data-testid="defib-save" disabled={!ready} onClick={() => { if (ready) onSave(energy!, synchronized!) }}
            className="flex-1 rounded-xl bg-amber-500 px-3 py-2.5 text-sm font-bold text-slate-900 disabled:opacity-40">
            {!isValidDefibrillationEnergy(energy) ? t("setEnergy") : synchronized == null ? t("chooseSync") : t("save")}
          </button>
        </div>
      </div>
    </div>
  )
}
