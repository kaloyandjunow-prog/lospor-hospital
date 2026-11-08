"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { MONITORING_READINGS, STANDARD_MONITORING, readingDue, standardMonitoringOn, toggleStandardMonitoring, type MonitoringReasonKey, type MonitoringSuggestion } from "@lospor/core/monitoring-smart"
import type { LibraryOption } from "@/hooks/useOptionLibrary"
import { displayOption } from "@/lib/clinical-display"
import { MonitoringGroups } from "./MonitoringGroups"

const REASON: Record<MonitoringReasonKey, string> = {
  airway: "reasonAirway", arterialLine: "reasonArterialLine", centralLine: "reasonCentralLine", relaxant: "reasonRelaxant",
  tiva: "reasonTiva", longGeneral: "reasonLongGeneral",
}

/**
 * The Monitoring section, Smart selection (10.2.0): standard monitoring in one switch, what is on (with its
 * last reading, amber when one is due), the monitors the case calls for with the reason, and the full
 * grouped list in place under "More monitors". What is suggested and when a reading is due is Core's
 * (monitoring-smart); a monitor added here sets the same flag the legacy section sets.
 */
export function MonitoringSmart({ monitoring, onChange, monitoringOptions, suggestions, onHide, lastReading, now, dueMinutes, onReading }: {
  monitoring: readonly string[]
  onChange: (next: string[]) => void
  monitoringOptions: readonly LibraryOption[]
  suggestions: readonly MonitoringSuggestion[]
  onHide: (suggestion: MonitoringSuggestion) => void
  /** The last reading charted for a monitor: its text and when it was taken. */
  lastReading: (field: string) => { text: string; at: string } | null
  now: () => string
  /** The hospital's reading intervals (Status), per monitor, in minutes. */
  dueMinutes?: Readonly<Record<string, number>> | null
  /** Opens the timetable's entry for this monitor's reading, in the current column (as the phone's chip does). */
  onReading?: (field: string) => void
}) {
  const t = useTranslations("intraop.monitoringSmart")
  const locale = useLocale()
  const [more, setMore] = useState(false)
  const name = (field: string) => { const option = monitoringOptions.find(item => item.value === field); return option ? displayOption("MONITORING", option, locale) : field }
  const extras = monitoring.filter(field => !STANDARD_MONITORING.includes(field))
  const availableCount = monitoringOptions.filter(option => !monitoring.includes(option.value)).length
  // The active list is authoritative; do not leave a just-added suggestion
  // visible while a parent is persisting the same selection.
  const visibleSuggestions = suggestions.filter(item => !monitoring.includes(item.field))
  const standard = standardMonitoringOn(monitoring)
  const toggle = (field: string) => onChange(monitoring.includes(field) ? monitoring.filter(item => item !== field) : [...monitoring, field])
  const eyebrow = "text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-4 mb-2"
  const row = "flex items-center gap-3 rounded-xl border border-slate-200 dark:border-[#333] px-3 py-2 mb-2"
  const side = "min-h-11 min-w-11 rounded-xl border px-3 text-sm font-bold"

  return (
    <div data-testid="monitoring-smart">
      <button type="button" aria-pressed={standard} data-testid="monitoring-standard" onClick={() => onChange(toggleStandardMonitoring(monitoring))}
        className={`w-full flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left ${standard ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200 dark:border-[#333]"}`}>
        <span className="flex-1">
          <span className="block font-bold">{t("standard")}</span>
          <span className="block text-xs text-slate-500">{t("standardHint")}</span>
        </span>
        <span className={`grid h-7 w-7 place-items-center rounded-full border-2 text-sm font-bold ${standard ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>{standard ? "✓" : ""}</span>
      </button>

      <p className={eyebrow}>{t("onNow")}{extras.length > 0 ? ` · ${extras.length}` : ""}</p>
      {extras.length === 0 ? (
        <div data-testid="monitoring-smart-empty" className={`${row} text-sm text-slate-500`}>{t("nothingMore")}</div>
      ) : extras.map(field => {
        const reading = MONITORING_READINGS[field] ? lastReading(field) : null
        const due = !!MONITORING_READINGS[field] && readingDue(field, reading?.at ?? null, null, now(), dueMinutes)
        return (
          <div key={field} data-testid={`monitoring-on-${field}`} className={row}>
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold">{name(field)}</span>
              {due ? <span className="block text-xs text-amber-600 dark:text-amber-400">{t("due")}</span> : null}
            </span>
            {MONITORING_READINGS[field] ? (
              <button type="button" data-testid={`monitoring-reading-${field}`} disabled={!onReading} onClick={() => onReading?.(field)} className={`px-3 py-1 rounded-lg border text-sm font-bold tabular-nums disabled:cursor-default ${due ? "border-amber-500 text-amber-600 dark:text-amber-400" : "border-violet-400 text-violet-700 dark:text-violet-300"}`}>{reading?.text ?? t("noReading")}</button>
            ) : null}
            <button type="button" data-testid={`monitoring-off-${field}`} aria-label={t("turnOff")} onClick={() => toggle(field)} className={`${side} border-slate-300 dark:border-[#444] text-slate-500`}>{t("turnOff")}</button>
          </div>
        )
      })}

      <p className={eyebrow}>{t("suggested")}</p>
      {visibleSuggestions.length === 0 ? (
        <div data-testid="monitoring-no-suggestions" className={`${row} text-sm text-slate-500`}>{t("noSuggestions")}</div>
      ) : visibleSuggestions.map(item => (
        <div key={item.field} data-testid={`monitoring-suggestion-${item.field}`} className={`${row} border-dashed !border-amber-500`}>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold">{name(item.field)}</span>
            <span className="block text-xs text-amber-600 dark:text-amber-400">{t(REASON[item.reason])}</span>
          </span>
          <button type="button" data-testid={`monitoring-add-${item.field}`} aria-label={t("add")} aria-pressed={monitoring.includes(item.field)} onClick={() => toggle(item.field)} className={`${side} border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300`}>{t("add")}</button>
          <button type="button" data-testid={`monitoring-hide-${item.field}`} aria-label={t("hide")} onClick={() => onHide(item)} className={`${side} border-slate-300 dark:border-[#444] text-slate-500`}>{t("hide")}</button>
        </div>
      ))}

      <button type="button" data-testid="monitoring-more" onClick={() => setMore(value => !value)}
        className="mt-1 mb-3 w-full min-h-11 rounded-xl border border-slate-300 dark:border-[#444] text-sm font-bold text-violet-700 dark:text-violet-300">{more ? t("fewer") : t("more", { count: availableCount })}</button>
      {more ? <MonitoringGroups monitoring={monitoring} onToggle={toggle} monitoringOptions={monitoringOptions} /> : null}
    </div>
  )
}
