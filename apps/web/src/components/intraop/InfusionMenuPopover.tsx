"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import type { PumpTotalUnit } from "@lospor/core/intraop-types"
import type { AnchorRect } from "./anchored-position"
import { useIntraopUiCopy } from "./ui-copy"

/**
 * What can be done to an infusion already on the chart.
 *
 * A discontinued line keeps its place on the record and offers only restore:
 * an infusion that ran and was stopped is part of what happened, so it is never
 * removed from the chart by this menu — it is struck through and can be brought
 * back if it was stopped in error. A running one entered by mistake can be
 * removed (10.0.0; before, only the Delete key or a drag off the chart did it,
 * neither of which a finger has), behind the timetable's confirmation.
 *
 * Presentational; the timetable owns every change.
 */

export type InfusionMenuPopoverProps = {
  anchor: AnchorRect
  name: string
  color: string
  stopped: boolean
  onChangeRate: () => void
  /** With the pump's own total when one was entered (TCI). */
  onDiscontinue: (pump?: PumpTotalEntry) => void
  /**
   * A TCI infusion: the total the pump shows may be entered on the stop, or
   * after it, and then counts instead of the calculation (2026-10-18).
   */
  pumpTotal?: { amountUnit: "mg" | "mcg"; value?: number; unit?: PumpTotalUnit; onSave: (pump?: PumpTotalEntry) => void }
  onRestore: () => void
  /** Remove a running infusion entered by mistake; the timetable asks first. */
  onRemove?: () => void
  /** Highlights the bar that Discontinue would end. */
  onDiscontinueHover: (hovering: boolean) => void
  onDismiss: () => void
}

const itemClass = "w-full text-left text-sm font-medium px-4 py-2.5 transition-colors"

export type PumpTotalEntry = { value: number; unit: PumpTotalUnit }

export function InfusionMenuPopover({
  anchor,
  name,
  color,
  stopped,
  onChangeRate,
  onDiscontinue,
  onRestore,
  onRemove,
  onDiscontinueHover,
  onDismiss,
  pumpTotal,
}: InfusionMenuPopoverProps) {
  const copy = useIntraopUiCopy()
  const [pumpText, setPumpText] = useState(pumpTotal?.value != null ? String(pumpTotal.value) : "")
  const [pumpUnit, setPumpUnit] = useState<PumpTotalUnit>(pumpTotal?.unit ?? "mL")
  const pumpValue = Number(pumpText.replace(",", "."))
  // Empty is "not entered"; anything else must be a number of 0 or more.
  const pumpInvalid = pumpText.trim() !== "" && !(Number.isFinite(pumpValue) && pumpValue >= 0)
  const pumpEntry = pumpText.trim() && !pumpInvalid ? { value: pumpValue, unit: pumpUnit } : undefined
  const pumpField = pumpTotal && (
    <div data-testid="pump-total-field" className="px-3 py-2 border-t border-slate-100 dark:border-[#3a3a3a] space-y-1">
      <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-400">{copy.tci.pumpTotal}</label>
      <div className="flex items-center gap-1">
        <input type="number" inputMode="decimal" min={0} value={pumpText} onChange={event => setPumpText(event.target.value)} aria-label={copy.tci.pumpTotal}
          className="min-w-0 flex-1 text-xs border border-slate-200 dark:border-[#3a3a3a] rounded-md px-2 py-1 bg-white dark:bg-[#1e1e1e] [appearance:textfield]" />
        <select value={pumpUnit} onChange={event => setPumpUnit(event.target.value as PumpTotalUnit)} aria-label={copy.tci.pumpTotal}
          className="text-xs border border-slate-200 dark:border-[#3a3a3a] rounded-md px-1 py-1 bg-white dark:bg-[#1e1e1e]">
          {(["mL", pumpTotal.amountUnit] as const).map(unit => <option key={unit} value={unit}>{unit}</option>)}
        </select>
        {stopped && (
          <button type="button" disabled={pumpInvalid} onClick={() => pumpTotal.onSave(pumpEntry)}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 px-2 py-1 disabled:opacity-40">{copy.apply}</button>
        )}
      </div>
      {pumpInvalid
        ? <p role="alert" className="text-[10px] text-red-500 dark:text-red-400">{copy.infusionNeeds.dose}</p>
        : <p className="text-[10px] text-slate-400">{copy.tci.pumpTotalHint}</p>}
    </div>
  )
  if (typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-50" onClick={onDismiss}>
      <div
        className="absolute bg-white dark:bg-[#2a2a2a] rounded-xl shadow-xl border border-slate-200 dark:border-[#3a3a3a] overflow-hidden min-w-[160px]"
        style={{
          top: Math.min(anchor.bottom + 4, window.innerHeight - 120),
          left: Math.min(anchor.left, window.innerWidth - 180),
        }}
        onClick={event => event.stopPropagation()}
      >
        <p
          className="text-[9px] font-bold uppercase tracking-wider px-3 pt-2.5 pb-1 flex items-center gap-1.5"
          style={{ color }}
        >
          {name}
          {stopped && (
            <span className="text-[8px] font-normal text-slate-400 normal-case tracking-normal">
              {copy.infusion.discontinued}
            </span>
          )}
        </p>

        {stopped ? (
          <button
            type="button"
            onClick={onRestore}
            className={`${itemClass} hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400`}
          >
            {copy.infusion.restore}
          </button>
        ) : null}
        {stopped && pumpField}
        {!stopped && (
          <>
            <button
              type="button"
              onClick={onChangeRate}
              className={`${itemClass} hover:bg-slate-50 dark:hover:bg-[#333] text-slate-700 dark:text-slate-200`}
            >
              {copy.infusion.changeRate}
            </button>
            {pumpField}
            <button
              type="button"
              disabled={pumpInvalid}
              onMouseEnter={() => onDiscontinueHover(true)}
              onMouseLeave={() => onDiscontinueHover(false)}
              onClick={() => onDiscontinue(pumpEntry)}
              className={`${itemClass} hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 border-t border-slate-100 dark:border-[#3a3a3a]`}
            >
              {copy.discontinue}
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                data-testid="infusion-remove"
                className={`${itemClass} hover:bg-slate-50 dark:hover:bg-[#333] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-[#3a3a3a]`}
              >
                {copy.infusion.removeEnteredInError}
              </button>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
