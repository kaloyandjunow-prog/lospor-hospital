"use client"

import { createPortal } from "react-dom"
import type { FluidEntryMode } from "@lospor/core/intraop-fluids"
import type { FluidConflict } from "./timetable-types"
import { useIntraopUiCopy } from "./ui-copy"

/**
 * Starting a fluid while the same one is already running.
 *
 * Only the clinician can say what happened: the first bag is still going and
 * both should run, or it finished and this one replaces it — and if it finished
 * early, how much actually went in. Guessing any of that would put a volume
 * nobody measured into the fluid balance.
 *
 * Presentational on purpose. Every state transition stays in the timetable,
 * which owns the chart data; this decides only what the three phases look like
 * and which callback a button calls.
 */

export type FluidConflictPopoverProps = {
  conflict: FluidConflict
  /** How the already-running fluid was charted; a rate line has a computable volume. */
  existingEntryMode: FluidEntryMode | undefined
  labels: {
    wasItFinished: string
    howMuchInfused: string
  }
  onDismiss: () => void
  onRunInParallel: () => void
  onStopExisting: () => void
  onFinishedAnswer: (fullyInfused: boolean) => void
  onVolumeInput: (value: string) => void
  onConfirmVolume: () => void
}

const POPOVER_WIDTH = 230

const primaryButton =
  "w-full text-xs font-semibold bg-slate-700 hover:bg-slate-600 dark:bg-[#2a2a2a] dark:hover:bg-[#383838] dark:border dark:border-[#4a4a4a] text-white rounded-lg py-1.5"
const secondaryButton =
  "w-full text-xs font-semibold border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] rounded-lg py-1.5"
const captionClass = "text-[9px] font-bold text-slate-400 uppercase tracking-wide"

export function FluidConflictPopover({
  conflict,
  existingEntryMode,
  labels,
  onDismiss,
  onRunInParallel,
  onStopExisting,
  onFinishedAnswer,
  onVolumeInput,
  onConfirmVolume,
}: FluidConflictPopoverProps) {
  const copy = useIntraopUiCopy()
  if (typeof document === "undefined") return null

  const anchor = conflict.anchor
  // Flip above the anchor when there is not enough room below, so the buttons
  // are never off-screen on a short window.
  const showAbove = window.innerHeight - anchor.bottom < 240
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - POPOVER_WIDTH - 8))
  const top = showAbove ? anchor.top - 4 : anchor.bottom + 4

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9994]" onClick={onDismiss} />
      <div
        style={{
          position: "fixed",
          left,
          top,
          width: POPOVER_WIDTH,
          zIndex: 9995,
          transform: showAbove ? "translateY(-100%)" : undefined,
        }}
        className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-2xl p-3 space-y-2.5"
        onClick={event => event.stopPropagation()}
      >
        {conflict.phase === "choose" && (
          <>
            <p className={captionClass}>{conflict.pending.category} {copy.fluidConflict.conflict}</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold" style={{ color: conflict.pending.color }}>
                {conflict.existingName}
              </span>
              {" "}{copy.fluidConflict.alreadyRunning}
            </p>
            <div className="space-y-1">
              <button type="button" onClick={onStopExisting} className={primaryButton}>
                {copy.fluidConflict.stop(conflict.existingName)}
              </button>
              <button type="button" onClick={onRunInParallel} className={secondaryButton}>
                {copy.fluidConflict.runParallel}
              </button>
            </div>
          </>
        )}

        {conflict.phase === "finished" && (
          <>
            <p className={captionClass}>{labels.wasItFinished}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {copy.fluidConflict.fullVolumeQuestion(conflict.pending.category.toLowerCase())}
            </p>
            <div className="space-y-1">
              <button type="button" onClick={() => onFinishedAnswer(true)} className={primaryButton}>
                {copy.fluidConflict.fullyInfused}
              </button>
              <button type="button" onClick={() => onFinishedAnswer(false)} className={secondaryButton}>
                {copy.fluidConflict.stoppedEarly}
              </button>
            </div>
          </>
        )}

        {conflict.phase === "volume" && (
          <>
            <p className={captionClass}>
              {existingEntryMode === "RATE"
                // A rate line's delivered volume is computed and offered, but it
                // stays editable: the pump is the record, not the arithmetic.
                ? copy.fluidConflict.calculatedVolume
                : labels.howMuchInfused}
            </p>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="number"
                min={0}
                placeholder="0"
                value={conflict.volInput}
                onChange={event => onVolumeInput(event.target.value)}
                onKeyDown={event => { if (event.key === "Enter") onConfirmVolume() }}
                className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
              <span className="text-xs font-semibold text-slate-400">mL</span>
            </div>
            <button type="button" onClick={onConfirmVolume} className={primaryButton}>
              {copy.confirm}
            </button>
          </>
        )}
      </div>
    </>,
    document.body,
  )
}
