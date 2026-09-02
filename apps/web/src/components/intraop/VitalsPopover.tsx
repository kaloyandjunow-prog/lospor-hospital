"use client"

import { createPortal } from "react-dom"
import { ConvertedStepper } from "@/components/ConvertedStepper"
import { NumberStepper } from "@/components/NumberStepper"
import { useIntraopUiCopy } from "./ui-copy"

/**
 * Entering one vital sign into one chart column.
 *
 * Two of the seven are recorded in units the clinician may not be working in —
 * end-tidal CO2 and temperature — so those get the converting stepper, which
 * shows whichever unit the user has chosen while storing the canonical one. The
 * rest are unambiguous and use the plain stepper.
 *
 * Closing commits. If the cell was never touched, the value shown on screen is
 * what gets stored: the popover opens already displaying the previous column's
 * reading, and dismissing it is how an anaesthetist says "same as before"
 * without retyping. That is deliberate, and it is why dismissal goes through
 * the same path as the Done button rather than simply unmounting.
 */

export type VitalsPopoverProps = {
  anchor: { top: number; bottom: number; left: number; right: number; width: number }
  label: string
  unit: string
  color: string
  /** Canonical measurement kind, for the two that need unit conversion. */
  converts: "etco2" | "temperature" | null
  /** The value stored for this cell, or undefined when nothing has been entered. */
  value: number | undefined
  /** What the cell displays when empty — usually the previous column's reading. */
  fallbackValue: number
  min: number
  max: number
  step: number
  onChange: (value: number | null) => void
  /** Called on Done and on dismissal; both commit. */
  onCommit: () => void
}

export function VitalsPopover({
  anchor,
  label,
  unit,
  color,
  converts,
  value,
  fallbackValue,
  min,
  max,
  step,
  onChange,
  onCommit,
}: VitalsPopoverProps) {
  const copy = useIntraopUiCopy()
  if (typeof document === "undefined") return null

  const shown = value ?? fallbackValue

  return createPortal(
    <div className="fixed inset-0 z-50" onClick={onCommit}>
      <div
        className="absolute bg-white dark:bg-[#2a2a2a] rounded-xl shadow-2xl p-4 w-64 border border-slate-200 dark:border-[#3a3a3a] space-y-3"
        style={{
          top: Math.min(anchor.bottom + 6, window.innerHeight - 220),
          left: Math.max(4, Math.min(anchor.left - 80, window.innerWidth - 280)),
        }}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
          <span className="text-xs text-slate-400 ml-auto">{unit}</span>
        </div>

        {converts ? (
          <ConvertedStepper
            measurement={converts}
            canonicalValue={shown}
            onCanonicalChange={onChange}
            canonicalMin={min}
            canonicalMax={max}
            canonicalStep={step}
            showSlider
          />
        ) : (
          <NumberStepper
            value={shown}
            onChange={onChange}
            min={min}
            max={max}
            step={step}
            unit={unit}
            showSlider
          />
        )}

        <button
          type="button"
          onClick={onCommit}
          className="w-full text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-1.5 transition-colors"
        >
          {copy.done}
        </button>
      </div>
    </div>,
    document.body,
  )
}
