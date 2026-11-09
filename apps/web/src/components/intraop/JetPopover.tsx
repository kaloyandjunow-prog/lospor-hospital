"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { JET_VENTILATION, parseJetPressure, parseJetRate } from "@lospor/core/gas-ranges"
import type { JetSettings } from "./jet-lane"

const WIDTH = 260

const parseFio2 = (raw: string): number | null => {
  const value = Number(raw)
  return Number.isInteger(value) && value >= JET_VENTILATION.fio2.min && value <= JET_VENTILATION.fio2.max ? value : null
}

/**
 * The jet ventilation sheet (10.2.0): driving pressure on a 0-4 bar slider
 * (typed to 6), the rate from the quick values for manual and high-frequency
 * jet (typed to 600/min), and FiO2. Start, a change from this column, or
 * Stop: the lane works like the gas settings.
 */
export function JetPopover({ anchor, initial, editing, onApply, onStop, onDismiss }: {
  anchor: { top: number; bottom: number; left: number; right: number; width: number }
  initial: JetSettings
  /** A running jet at this column: the sheet changes it and offers Stop. */
  editing: boolean
  onApply: (settings: JetSettings) => void
  onStop?: () => void
  onDismiss: () => void
}) {
  const t = useTranslations("intraop.jet")
  const [settings, setSettings] = useState<JetSettings>(initial)
  const set = (patch: Partial<JetSettings>) => setSettings(prev => ({ ...prev, ...patch }))
  const left = typeof window !== "undefined" ? Math.min(Math.max(8, anchor.left), window.innerWidth - WIDTH - 8) : anchor.left

  function typed(value: number, parse: (raw: string) => number | null, apply: (n: number) => void, label: string, testId: string) {
    return (
      <input key={value} defaultValue={value} inputMode="decimal" aria-label={label} data-testid={testId}
        onBlur={event => { const parsed = parse(event.target.value); if (parsed != null) apply(parsed) }}
        onKeyDown={event => { if (event.key === "Enter") (event.target as HTMLInputElement).blur() }}
        className="w-14 shrink-0 text-xs px-1 py-0.5 rounded border border-slate-200 dark:border-[#3a3a3a] bg-transparent text-right" />
    )
  }

  const heading = (label: string, value: string) => (
    <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold">
      <span>{label}</span><span className="text-xs font-bold text-teal-600 dark:text-teal-400">{value}</span>
    </div>
  )

  const body = (
    <div className="fixed inset-0 z-50" onClick={onDismiss}>
      <div role="dialog" aria-label={t("row")} data-testid="jet-popover"
        style={{ top: anchor.bottom + 4, left, width: WIDTH, position: "fixed" }}
        className="bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl p-3 space-y-2.5"
        onClick={event => event.stopPropagation()}>
        <div className="space-y-1">
          {heading(t("pressure"), `${settings.pressureBar} bar`)}
          <div className="flex items-center gap-1.5">
            <input type="range" min={JET_VENTILATION.pressure.min} max={JET_VENTILATION.pressure.sliderMax} step={JET_VENTILATION.pressure.step}
              value={Math.min(settings.pressureBar, JET_VENTILATION.pressure.sliderMax)} data-testid="jet-pressure"
              onChange={event => set({ pressureBar: Math.round(parseFloat(event.target.value) * 10) / 10 })} className="w-full h-1.5 accent-teal-500" />
            {typed(settings.pressureBar, parseJetPressure, pressureBar => set({ pressureBar }), "bar", "jet-pressure-typed")}
          </div>
        </div>
        <div className="space-y-1">
          {heading(t("rate"), `${settings.rate}/min`)}
          <div className="flex items-center gap-1">
            {JET_VENTILATION.rate.quick.map(rate => (
              <button key={rate} type="button" data-testid={`jet-rate-${rate}`} onClick={() => set({ rate })}
                className={`flex-1 text-[10px] font-semibold px-1 py-1 rounded-lg border ${settings.rate === rate ? "bg-teal-500 border-teal-500 text-white" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500"}`}>
                {rate}
              </button>
            ))}
            {typed(settings.rate, parseJetRate, rate => set({ rate }), "/min", "jet-rate-typed")}
          </div>
        </div>
        <div className="space-y-1">
          {heading("FiO₂", `${settings.fio2}%`)}
          <div className="flex items-center gap-1.5">
            <input type="range" min={JET_VENTILATION.fio2.min} max={JET_VENTILATION.fio2.max} step={1} value={settings.fio2} data-testid="jet-fio2"
              onChange={event => set({ fio2: parseInt(event.target.value, 10) })} className="w-full h-1.5 accent-teal-500" />
            {typed(settings.fio2, parseFio2, fio2 => set({ fio2 }), "%", "jet-fio2-typed")}
          </div>
        </div>
        <div className="flex gap-1.5">
          {editing && onStop && (
            <button type="button" data-testid="jet-stop" onClick={onStop} className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-red-300 text-red-500">{t("stop")}</button>
          )}
          <button type="button" data-testid="jet-apply" onClick={() => onApply(settings)} className="flex-1 text-xs px-2 py-1.5 rounded-lg bg-teal-600 text-white font-semibold">
            {editing ? t("apply") : t("start")}
          </button>
        </div>
      </div>
    </div>
  )
  return typeof document !== "undefined" ? createPortal(body, document.body) : body
}
