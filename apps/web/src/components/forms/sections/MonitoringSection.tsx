"use client"
import { useLocale } from "next-intl"
import { SectionCard } from "@/components/forms/shared/SectionCard"
import type { LibraryOption } from "@/hooks/useOptionLibrary"
import { displayClinicalCode, displayOption } from "@/lib/clinical-display"
import type { Path, UseFormWatch, UseFormSetValue } from "react-hook-form"
import type { IntraopFormFields } from "@/components/forms/IntraopForm"

// monitoringOptions' `value` is a free-form string from the OptionLibrary
// DB table (MONITORING category), not a compile-time literal — these casts
// to Path<IntraopFormFields> document "this DB-driven field name is expected
// to match a real form field" rather than opting out of checking entirely.
function asPath(name: string): Path<IntraopFormFields> { return name as Path<IntraopFormFields> }

export function MonitoringSection({ t, watch, setValue, monitoringOptions, advancedMonOpen, setAdvancedMonOpen }: {
  t: (key: string) => string
  watch: UseFormWatch<IntraopFormFields>
  setValue: UseFormSetValue<IntraopFormFields>
  monitoringOptions: LibraryOption[]
  advancedMonOpen: boolean
  setAdvancedMonOpen: (updater: (v: boolean) => boolean) => void
}) {
  const locale = useLocale()
  return (
    <SectionCard title={t("intraop.monitoringSection")} collapsible
      badge={(() => { const tot = monitoringOptions.filter(m => watch(asPath(m.value))).length; return tot ? `${tot} active` : undefined })()}>

      <div className="space-y-4">
        {/* Standard monitoring — always visible, pre-selected */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{displayClinicalCode("optionGroup", "standard", locale)}</p>
          <div className="flex flex-wrap gap-2">
            {monitoringOptions.filter(m => ["ecg","spO2Monitor","nbpMonitor"].includes(m.value)).map(m => {
              const on = watch(asPath(m.value)) as boolean
              return (
                <button key={m.value} type="button"
                  onClick={() => setValue(asPath(m.value), !on)}
                  className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${
                    on
                      ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white scale-105 shadow-sm"
                      : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                  }`}>
                  {displayOption("MONITORING", m, locale)}
                </button>
              )
            })}
          </div>
        </div>

        {/* Advanced monitoring — collapsible */}
        {(() => {
          const ADVANCED_FIELDS = monitoringOptions.filter(m => !["ecg","spO2Monitor","nbpMonitor"].includes(m.value))
          const advCount = ADVANCED_FIELDS.filter(m => watch(asPath(m.value)) as boolean).length
          return (
            <div>
              <button type="button"
                onClick={() => setAdvancedMonOpen(v => !v)}
                className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                <span className={`transition-transform ${advancedMonOpen ? "rotate-90" : ""}`}>▶</span>
                {displayClinicalCode("optionGroup", "advanced", locale)}
                {advCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-700 text-white text-[10px] font-bold">{advCount}</span>
                )}
              </button>
              {advancedMonOpen && (
                <div className="mt-3 space-y-3">
                  {([
                    ["respiratory", displayClinicalCode("optionGroup", "respiratory", locale)],
                    ["haemodynamic", displayClinicalCode("optionGroup", "haemodynamic", locale)],
                    ["depth", displayClinicalCode("optionGroup", "depth", locale)],
                    ["other", displayClinicalCode("optionGroup", "other", locale)],
                  ] as const).map(([cat, catLabel]) => {
                    const items = ADVANCED_FIELDS.filter(m => m.group === cat)
                    if (!items.length) return null
                    return (
                      <div key={cat}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{catLabel}</p>
                        <div className="flex flex-wrap gap-2">
                          {items.map(m => {
                            const on = watch(asPath(m.value)) as boolean
                            return (
                              <button key={m.value} type="button"
                                onClick={() => setValue(asPath(m.value), !on)}
                                className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${
                                  on
                                    ? "bg-slate-800 border-slate-700 text-white dark:bg-[#2e2e2e] dark:border-[#555] dark:text-white scale-105 shadow-sm"
                                    : "border-slate-200 dark:border-[#333] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#444] hover:bg-slate-50 dark:hover:bg-[#1e1e1e]"
                                }`}>
                                {displayOption("MONITORING", m, locale)}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}
      </div>
    </SectionCard>
  )
}
