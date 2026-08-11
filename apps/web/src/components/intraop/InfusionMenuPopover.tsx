"use client"

import { createPortal } from "react-dom"
import type { AnchorRect } from "./anchored-position"

/**
 * What can be done to an infusion already on the chart.
 *
 * A discontinued line keeps its place on the record and offers only restore:
 * an infusion that ran and was stopped is part of what happened, so it is never
 * removed from the chart by this menu — it is struck through and can be brought
 * back if it was stopped in error.
 *
 * Presentational; the timetable owns every change.
 */

export type InfusionMenuPopoverProps = {
  anchor: AnchorRect
  name: string
  color: string
  stopped: boolean
  onChangeRate: () => void
  onDiscontinue: () => void
  onRestore: () => void
  /** Highlights the bar that Discontinue would end. */
  onDiscontinueHover: (hovering: boolean) => void
  onDismiss: () => void
}

const itemClass = "w-full text-left text-sm font-medium px-4 py-2.5 transition-colors"

export function InfusionMenuPopover({
  anchor,
  name,
  color,
  stopped,
  onChangeRate,
  onDiscontinue,
  onRestore,
  onDiscontinueHover,
  onDismiss,
}: InfusionMenuPopoverProps) {
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
              discontinued
            </span>
          )}
        </p>

        {stopped ? (
          <button
            type="button"
            onClick={onRestore}
            className={`${itemClass} hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400`}
          >
            Restore infusion
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onChangeRate}
              className={`${itemClass} hover:bg-slate-50 dark:hover:bg-[#333] text-slate-700 dark:text-slate-200`}
            >
              Change rate
            </button>
            <button
              type="button"
              onMouseEnter={() => onDiscontinueHover(true)}
              onMouseLeave={() => onDiscontinueHover(false)}
              onClick={onDiscontinue}
              className={`${itemClass} hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 border-t border-slate-100 dark:border-[#3a3a3a]`}
            >
              Discontinue
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
