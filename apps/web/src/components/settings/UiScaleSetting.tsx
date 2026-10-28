"use client"

import { useTranslations } from "next-intl"
import { UI_SCALE_DEFAULT, UI_SCALE_MAX, UI_SCALE_MIN, UI_SCALE_STEP } from "@/lib/ui-scale"

export function UiScaleSetting({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const t = useTranslations()
  return <div className="flex items-center gap-2"><input type="range" min={UI_SCALE_MIN} max={UI_SCALE_MAX} step={UI_SCALE_STEP} value={value} onChange={event => onChange(Number(event.target.value))} aria-label={t("settings.uiScale")} data-testid="ui-scale-slider" className="h-2 w-32 cursor-pointer accent-blue-600" /><span className="w-11 text-right text-xs font-semibold tabular-nums" data-testid="ui-scale-value">{value}%</span><button type="button" onClick={() => onChange(UI_SCALE_DEFAULT)} disabled={value === UI_SCALE_DEFAULT} className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 disabled:opacity-40 dark:border-[#333] dark:text-slate-300">{t("settings.uiScaleReset")}</button></div>
}
