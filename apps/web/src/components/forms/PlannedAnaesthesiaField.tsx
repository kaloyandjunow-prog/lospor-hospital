"use client"

import { useLocale, useTranslations } from "next-intl"
import { normalizePlannedAnaesthesia, type PlannedAnaesthesia } from "@lospor/core/preop-plan"
import { TechniqueTree } from "@/components/TechniqueTree"
import { VascularAccessTree, type VascularAccess } from "@/components/VascularAccessTree"
import { useOptionLibrary, type LibraryOption } from "@/hooks/useOptionLibrary"
import { displayOption } from "@/lib/clinical-display"

function Chips({ options, chosen, onChange, testId }: {
  options: { value: string; label: string }[]
  chosen: string[]
  onChange: (next: string[]) => void
  testId: string
}) {
  return (
    <div className="flex flex-wrap gap-2" data-testid={testId}>
      {options.map(option => {
        const on = chosen.includes(option.value)
        return (
          <button key={option.value} type="button" role="checkbox" aria-checked={on} data-testid={`${testId}-${option.value}`}
            onClick={() => onChange(on ? chosen.filter(item => item !== option.value) : [...chosen, option.value])}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${on
              ? "border-blue-600 bg-blue-50 font-semibold text-blue-800 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-200"
              : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-[#3a3a3a] dark:text-slate-400 dark:hover:border-[#555]"}`}>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The anaesthesia planned at the preop visit (optional), in the intraoperative
 * record's own menus: technique, airway devices and instruments, lines, and
 * ventilation after the operation. The summary prints it; layout C of the
 * consent starts with the sections it needs ticked.
 */
export function PlannedAnaesthesiaField({ value, onChange }: {
  value: unknown
  onChange: (next: PlannedAnaesthesia) => void
}) {
  const t = useTranslations()
  const locale = useLocale()
  const plan = normalizePlannedAnaesthesia(value)
  const set = (patch: Partial<PlannedAnaesthesia>) => onChange({ ...plan, ...patch })
  const { options: airwayOptions } = useOptionLibrary("AIRWAY_MANAGEMENT")
  const chips = (group: string) => airwayOptions
    .filter((option: LibraryOption) => option.group === group)
    .map(option => ({ value: option.value, label: displayOption("AIRWAY_MANAGEMENT", option, locale) }))
  const heading = "text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"

  return (
    <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-[#2a2a2a]" data-testid="preop-planned-anaesthesia">
      <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-300">{t("preop.plannedAnaesthesia")}</legend>
      <div className="space-y-1.5">
        <div className={heading}>{t("intraop.techniqueSection")}</div>
        <TechniqueTree value={plan.techniques} onChange={techniques => set({ techniques })} />
      </div>
      <div className="space-y-1.5">
        <div className={heading}>{t("intraop.airway.sectionTitle")}</div>
        <Chips options={chips("Device")} chosen={plan.airwayDevices} onChange={airwayDevices => set({ airwayDevices })} testId="preop-planned-device" />
        <div className="text-[11px] text-slate-500">{t("intraop.airway.instrumentsLabel")}</div>
        <Chips options={chips("Instrument")} chosen={plan.airwayTools} onChange={airwayTools => set({ airwayTools })} testId="preop-planned-tool" />
      </div>
      <div className="space-y-1.5">
        <div className={heading}>{t("intraop.vascularSection")}</div>
        <VascularAccessTree value={plan.vascularAccesses as VascularAccess[]} onChange={vascularAccesses => set({ vascularAccesses })} />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input type="checkbox" checked={plan.postopVentilation} onChange={event => set({ postopVentilation: event.target.checked })} data-testid="preop-planned-ventilation" />
        {t("preop.plannedPostopVentilation")}
      </label>
      <p className="text-xs text-slate-500">{t("preop.plannedAnaesthesiaHint")}</p>
    </fieldset>
  )
}
