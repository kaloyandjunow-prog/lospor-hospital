"use client"

import { FIO2, FRESH_GAS_FLOW, gasQuickValues, parseTypedFreshGasFlow, snapFreshGasFlow, stepFreshGasFlow } from "@lospor/core/gas-ranges"
import { createPortal } from "react-dom"
import { useIntraopUiCopy } from "./ui-copy"

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
  fgf: number | null
  carrierGas: string | null
  fio2: number
  /** Localised label for a carrier-gas option. */
  carrierGasLabel: (value: string | null, fallback: string) => string
  onFgfChange: (value: number) => void
  onCarrierGasChange: (value: string | null) => void
  onFio2Change: (value: number) => void
  onDismiss: () => void
  onApply: () => void
  /** The hospital's guidance switch: quick values only with it on, and not for a child (default on). */
  prospectiveGuidanceEnabled?: boolean
  paediatric?: boolean
}

/** A row of quick-value buttons; the one equal to the current value is filled. */
function QuickValues({ values, current, unit, onPick, disabled = false, testId }: {
  values: readonly number[]
  current: number | null
  unit: string
  onPick: (value: number) => void
  disabled?: boolean
  testId: string
}) {
  if (values.length === 0) return null
  return (
    <div className="flex gap-1" data-testid={testId}>
      {values.map(value => (
        <button
          key={value}
          type="button"
          disabled={disabled}
          aria-label={`${value} ${unit}`}
          data-testid={`${testId}-${value}`}
          onClick={() => onPick(value)}
          className={`flex-1 text-[10px] font-semibold px-1 py-0.5 rounded-lg border transition-colors disabled:opacity-50 ${
            current === value
              ? "bg-indigo-500 border-indigo-500 text-white"
              : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400"
          }`}
        >
          {value}
        </button>
      ))}
    </div>
  )
}

const POPOVER_WIDTH = 250 // room for the fresh gas − slider + and the typed value (10.2.0)

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
  prospectiveGuidanceEnabled = true,
  paediatric = false,
}: GasSettingsPopoverProps) {
  const copy = useIntraopUiCopy()
  // One set for web and phone (core): suggestions only for an adult with guidance on.
  const quick = gasQuickValues({ guidance: prospectiveGuidanceEnabled, paediatric })
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
          {isEditing ? copy.gas.editSettings : copy.gas.startSettings}
        </p>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 font-semibold">FGF</span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
              {fgf != null ? `${fgf} L/min` : "—"}
            </span>
          </div>
          {/* 10.2.0: 0-20 L/min, 0.1 steps to 5 (low flow) and 0.5 above; typed to 100 (core gas-ranges). */}
          <div className="flex items-center gap-1.5">
            <button type="button" aria-label="−" data-testid="fgf-minus" onClick={() => onFgfChange(stepFreshGasFlow(fgf ?? 0, -1))}
              className="w-6 h-6 shrink-0 rounded border border-slate-200 dark:border-[#3a3a3a] text-xs">−</button>
            <input
              type="range" min={FRESH_GAS_FLOW.min} max={FRESH_GAS_FLOW.sliderMax} step={FRESH_GAS_FLOW.fineStep}
              value={Math.min(fgf ?? 0, FRESH_GAS_FLOW.sliderMax)}
              data-testid="fgf-slider"
              onChange={event => onFgfChange(snapFreshGasFlow(parseFloat(event.target.value)))}
              className="w-full h-1.5 accent-indigo-500"
            />
            <button type="button" aria-label="+" data-testid="fgf-plus" onClick={() => onFgfChange(stepFreshGasFlow(fgf ?? 0, 1))}
              className="w-6 h-6 shrink-0 rounded border border-slate-200 dark:border-[#3a3a3a] text-xs">+</button>
            <input
              key={fgf ?? "none"}
              defaultValue={fgf ?? ""} inputMode="decimal" aria-label="FGF L/min" data-testid="fgf-typed"
              onBlur={event => { const typed = parseTypedFreshGasFlow(event.target.value); if (typed != null) onFgfChange(typed) }}
              onKeyDown={event => { if (event.key === "Enter") (event.target as HTMLInputElement).blur() }}
              className="w-12 shrink-0 text-xs px-1 py-0.5 rounded border border-slate-200 dark:border-[#3a3a3a] bg-transparent text-right"
            />
          </div>
          <QuickValues testId="fgf-quick" values={quick.freshGasFlow} current={fgf} unit="L/min" onPick={onFgfChange} />
        </div>

        <div className="space-y-1">
          <span className="text-[10px] text-slate-500 font-semibold">{copy.gas.carrier}</span>
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
            type="range" min={FIO2.min} max={FIO2.max} step={FIO2.step}
            value={effectiveFio2}
            onChange={event => onFio2Change(parseFloat(event.target.value))}
            disabled={oxygenOnly}
            className="w-full h-1.5 accent-indigo-500 disabled:opacity-50"
          />
          <QuickValues testId="fio2-quick" values={quick.fio2} current={effectiveFio2} unit="%" onPick={onFio2Change} disabled={oxygenOnly} />
        </div>

        <button
          type="button"
          onClick={onApply}
          className="w-full text-xs font-semibold bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg py-1.5 transition-colors"
        >
          {isEditing ? copy.apply : copy.gas.start}
        </button>
      </div>
    </>,
    document.body,
  )
}
