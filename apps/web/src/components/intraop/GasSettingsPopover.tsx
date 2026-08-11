"use client"

import { createPortal } from "react-dom"

/**
 * Fresh gas flow, carrier gas and inspired oxygen.
 *
 * Purely presentational: it reports what the anaesthetist moved and the
 * timetable decides what that means for the chart. The one rule it does hold is
 * the one that would otherwise be recorded wrongly — selecting oxygen alone
 * pins FiO2 at 100% and disables the slider, because there is nothing else in
 * the mixture to dilute it. Leaving that editable invites a record showing
 * 60% oxygen with no second gas.
 */

export type GasSettingsPopoverProps = {
  anchor: { top: number; bottom: number; left: number; right: number; width: number }
  isEditing: boolean
  fgf: number
  carrierGas: string | null
  fio2: number
  /** Localised label for a carrier-gas option. */
  carrierGasLabel: (value: string | null, fallback: string) => string
  onFgfChange: (value: number) => void
  onCarrierGasChange: (value: string | null) => void
  onFio2Change: (value: number) => void
  onDismiss: () => void
  onApply: () => void
}

const POPOVER_WIDTH = 210

const CARRIER_GASES: { value: string | null; label: string }[] = [
  { value: null, label: "O2 only" },
  { value: "air", label: "+ Air" },
  { value: "n2o", label: "+ N2O" },
]

export function GasSettingsPopover({
  anchor,
  isEditing,
  fgf,
  carrierGas,
  fio2,
  carrierGasLabel,
  onFgfChange,
  onCarrierGasChange,
  onFio2Change,
  onDismiss,
  onApply,
}: GasSettingsPopoverProps) {
  if (typeof document === "undefined") return null

  const showAbove = window.innerHeight - anchor.bottom < 280
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - POPOVER_WIDTH - 8))
  const top = showAbove ? anchor.top - 4 : anchor.bottom + 4

  // Oxygen alone is 100% by definition; there is no second gas to dilute it.
  const oxygenOnly = carrierGas == null
  const effectiveFio2 = oxygenOnly ? 100 : fio2

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onDismiss} />
      <div
        style={{
          position: "fixed",
          left,
          top,
          width: POPOVER_WIDTH,
          zIndex: 9999,
          transform: showAbove ? "translateY(-100%)" : undefined,
        }}
        className="bg-white dark:bg-[#2a2a2a] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl p-3 space-y-2.5"
        onClick={event => event.stopPropagation()}
      >
        <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">
          {isEditing ? "Edit gas settings" : "Start gas settings"}
        </p>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 font-semibold">FGF</span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{fgf} L/min</span>
          </div>
          <input
            type="range" min={0} max={10} step={0.5}
            value={fgf}
            onChange={event => onFgfChange(parseFloat(event.target.value))}
            className="w-full h-1.5 accent-indigo-500"
          />
        </div>

        <div className="space-y-1">
          <span className="text-[10px] text-slate-500 font-semibold">Carrier gas</span>
          <div className="flex gap-1">
            {CARRIER_GASES.map(option => (
              <button
                key={option.label}
                type="button"
                onClick={() => {
                  onCarrierGasChange(option.value)
                  if (option.value == null) onFio2Change(100)
                }}
                className={`flex-1 text-[10px] font-semibold px-1.5 py-1 rounded-lg border transition-colors ${
                  carrierGas === option.value
                    ? "bg-indigo-500 border-indigo-500 text-white"
                    : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400"
                }`}
              >
                {carrierGasLabel(option.value, option.label)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 font-semibold">FiO2</span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{effectiveFio2}%</span>
          </div>
          <input
            type="range" min={21} max={100} step={1}
            value={effectiveFio2}
            onChange={event => onFio2Change(parseFloat(event.target.value))}
            disabled={oxygenOnly}
            className="w-full h-1.5 accent-indigo-500 disabled:opacity-50"
          />
        </div>

        <button
          type="button"
          onClick={onApply}
          className="w-full text-xs font-semibold bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg py-1.5 transition-colors"
        >
          {isEditing ? "Apply" : "Start"}
        </button>
      </div>
    </>,
    document.body,
  )
}
