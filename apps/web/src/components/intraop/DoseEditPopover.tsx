"use client"

import { createPortal } from "react-dom"
import type { AnchorRect } from "./anchored-position"

/**
 * Correcting a dose already written on the chart.
 *
 * The unit is editable alongside the number, and deliberately so: the common
 * correction is not "80 should have been 100" but "that was micrograms, not
 * milligrams". Letting the figure be changed while the unit stayed fixed would
 * make the more dangerous mistake the harder one to fix.
 *
 * Nothing is written until Apply — dismissing leaves the recorded dose alone.
 */

export type DoseEditPopoverProps = {
  anchor: AnchorRect
  dose: string
  unit: string
  units: readonly string[]
  title: string
  onDoseChange: (dose: string) => void
  onUnitChange: (unit: string) => void
  onApply: () => void
  onDismiss: () => void
}

export function DoseEditPopover({
  anchor,
  dose,
  unit,
  units,
  title,
  onDoseChange,
  onUnitChange,
  onApply,
  onDismiss,
}: DoseEditPopoverProps) {
  if (typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-50" onClick={onDismiss}>
      <div
        className="absolute bg-white dark:bg-[#2a2a2a] rounded-xl shadow-2xl p-3 space-y-2 w-52 border border-slate-200 dark:border-[#3a3a3a]"
        style={{
          top: Math.min(anchor.bottom + 4, window.innerHeight - 160),
          left: Math.min(anchor.left, window.innerWidth - 220),
        }}
        onClick={event => event.stopPropagation()}
      >
        <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide">{title}</p>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={dose}
            onChange={event => onDoseChange(event.target.value)}
            autoFocus
            className="flex-1 text-sm border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1 bg-white dark:bg-[#1e1e1e] focus:outline-none focus:ring-1 focus:ring-violet-400 [appearance:textfield]"
            placeholder="0"
          />
          <select
            value={unit}
            onChange={event => onUnitChange(event.target.value)}
            className="text-xs border border-slate-200 dark:border-[#3a3a3a] rounded-lg px-1 py-1 bg-white dark:bg-[#1e1e1e] focus:outline-none"
          >
            {units.map(option => <option key={option}>{option}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={onApply}
          className="w-full text-xs font-semibold bg-violet-500 hover:bg-violet-600 text-white rounded-lg py-1.5 transition-colors"
        >
          Apply
        </button>
      </div>
    </div>,
    document.body,
  )
}
