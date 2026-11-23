"use client"

import { portalHost } from "@/lib/portal-host"
import { useState } from "react"
import { createPortal } from "react-dom"
import type { PumpTotalUnit } from "@lospor/core/intraop-types"
import { useIntraopUiCopy } from "./ui-copy"

/**
 * Stopping a TCI infusion (10.8.0): the only infusion that asks anything. The pump works the amount out by
 * its own model, so the total it shows may be entered and then counts instead of the calculation. Optional:
 * "Stop" with the field empty stops with the calculated total. Every other infusion stops without a question.
 */
export function TciStopDialog({ name, amountUnit, onStop, onCancel }: {
  name: string
  amountUnit: "mg" | "mcg"
  onStop: (pump?: { value: number; unit: PumpTotalUnit }) => void
  onCancel: () => void
}) {
  const copy = useIntraopUiCopy()
  const [text, setText] = useState("")
  const [unit, setUnit] = useState<PumpTotalUnit>("mL")
  const value = Number(text.replace(",", "."))
  const invalid = text.trim() !== "" && !(Number.isFinite(value) && value >= 0)
  if (typeof document === "undefined") return null
  return createPortal(
    <div className="fixed inset-0 z-[66] flex items-end sm:items-center justify-center bg-black/40 p-3" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label={name} data-testid="tci-stop-dialog" onClick={event => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#242424] border border-slate-200 dark:border-[#3a3a3a] shadow-xl p-4 space-y-3">
        <p className="text-sm font-bold text-slate-900 dark:text-white">{copy.discontinue} · {name}</p>
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">{copy.tci.pumpTotal}</label>
          <div className="flex items-center gap-2">
            <input autoFocus type="number" inputMode="decimal" min={0} value={text} onChange={event => setText(event.target.value)} aria-label={copy.tci.pumpTotal} data-testid="tci-stop-total"
              className="min-h-11 min-w-0 flex-1 text-base border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-3 bg-white dark:bg-[#1e1e1e] [appearance:textfield]" />
            <select value={unit} onChange={event => setUnit(event.target.value as PumpTotalUnit)} aria-label={copy.tci.pumpTotal}
              className="min-h-11 text-base border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-2 bg-white dark:bg-[#1e1e1e]">
              {(["mL", amountUnit] as const).map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          {invalid ? <p role="alert" className="text-xs text-red-500">{copy.infusionNeeds.dose}</p> : <p className="text-xs text-slate-400">{copy.tci.pumpTotalHint}</p>}
        </div>
        <div className="flex gap-2">
          <button type="button" className="min-h-11 flex-1 rounded-lg border border-slate-300 dark:border-[#444] font-semibold" onClick={onCancel}>{copy.cancel}</button>
          <button type="button" data-testid="tci-stop-confirm" disabled={invalid} className="min-h-11 flex-1 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-40"
            onClick={() => onStop(text.trim() ? { value, unit } : undefined)}>{copy.discontinue}</button>
        </div>
      </div>
    </div>,
    portalHost(),
  )
}
