"use client"

import { useLocale, useTranslations } from "next-intl"
import { MONITORING_PURPOSE_GROUPS } from "@lospor/core/monitoring-smart"
import type { LibraryOption } from "@/hooks/useOptionLibrary"
import { displayOption } from "@/lib/clinical-display"

const GROUP_KEY = { heart: "groupHeart", breathing: "groupBreathing", brain: "groupBrain", muscle: "groupMuscle", temperature: "groupTemperature" } as const

/**
 * Every monitor, grouped by what it tells you (10.2.0): the Legacy Monitoring section, and what
 * "More monitors" opens on the Smart one. The groups and short names are Core's (monitoring-smart).
 */
export function MonitoringGroups({ monitoring, onToggle, monitoringOptions }: {
  monitoring: readonly string[]
  onToggle: (field: string) => void
  monitoringOptions: readonly LibraryOption[]
}) {
  const t = useTranslations("intraop.monitoringSmart")
  const locale = useLocale()
  return (
    <div className="space-y-4" data-testid="monitoring-groups">
      {MONITORING_PURPOSE_GROUPS.map(group => (
        <div key={group.id}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{t(GROUP_KEY[group.id])}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {group.fields.map(({ field, short }) => {
              const on = monitoring.includes(field)
              const option = monitoringOptions.find(item => item.value === field)
              return (
                <button key={field} type="button" aria-pressed={on} data-testid={`monitoring-tile-${field}`} onClick={() => onToggle(field)}
                  className={`text-left rounded-xl border-2 px-3 py-2 transition-colors ${on
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                    : "border-slate-200 dark:border-[#333] hover:border-slate-300 dark:hover:border-[#444]"}`}>
                  <span className={`block text-sm font-bold ${on ? "text-emerald-700 dark:text-emerald-300" : ""}`}>{short}</span>
                  <span className="block text-[11px] leading-tight text-slate-500 line-clamp-2">{option ? displayOption("MONITORING", option, locale) : short}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
