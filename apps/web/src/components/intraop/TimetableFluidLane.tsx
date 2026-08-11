"use client"

import { X } from "lucide-react"
import { currentFluidRate, fluidDeliveredVolumeMl } from "@/lib/fluid-entry-ui"
import { barContinues, barLeftClass, barRightClass, showBarGrip } from "./timetable-row-geometry"
import type { TimetableDragActions, TimetableDragState } from "./use-timetable-drag"
import type { TtSel } from "./timetable-types"
import type { TimetableFluid } from "@/types/timetable"

/**
 * One fluid lane: a single line running down the chart.
 *
 * A case can have several bags of the same fluid going at once, which is why
 * fluids get a lane each rather than sharing one row — two crystalloid lines
 * drawn on top of each other would be unreadable and, worse, would look like a
 * single line at twice the rate.
 *
 * A lane's label carries the volume or rate, and a rate line's label is a
 * button: the rate is the thing most likely to change mid-case, so it is
 * changed by tapping the number rather than by hunting for a menu.
 *
 * Stopping a bag asks a different question depending on how it was recorded. A
 * rate line's delivered volume can be worked out from its rate and duration and
 * is offered as the answer; a bag entered by volume has to be asked about,
 * because only the person in the room knows how much of it actually went in.
 *
 * Presentational: every change goes back through the callbacks.
 */

export type FluidDiscontinueRequest = {
  id: string
  volInput: string
  rect: DOMRect
  /** Null for a volume bag, which must be asked; false to start a rate line at its computed volume. */
  fullBag: boolean | null
}

export type FluidLaneProps = {
  /** Lane heading, e.g. "Crystalloid 2". */
  label: string
  color: string
  segments: TimetableFluid[]
  labelWidth: number
  /** Absolute column indices this chart row covers. */
  rowCols: number[]
  colStart: number
  colEnd: number
  colW: number
  sel: TtSel | null
  setSel: (sel: TtSel | null) => void
  displayFluidName: (name: string) => string
  drag: TimetableDragState
  dragActions: TimetableDragActions
  extendFluid: (id: string, toCol: number) => void
  resumeFluid: (id: string) => void
  continueFluid: (seg: TimetableFluid, col: number) => void
  removeFluid: (id: string) => void
  onChangeRate: (request: { id: string; rate: string; rect: DOMRect }) => void
  onDiscontinue: (request: FluidDiscontinueRequest) => void
}

export function FluidLane({
  label,
  color,
  segments,
  labelWidth,
  rowCols,
  colStart,
  colEnd,
  colW,
  sel,
  setSel,
  displayFluidName,
  drag,
  dragActions,
  extendFluid,
  resumeFluid,
  continueFluid,
  removeFluid,
  onChangeRate,
  onDiscontinue,
}: FluidLaneProps) {
  const { extendingFluid, extFluidHover } = drag

  return (
    <div className="flex min-h-[64px] border-t border-slate-100 dark:border-[#2a2a2a] relative">
      <div
        style={{ width: labelWidth, minWidth: labelWidth }}
        className="flex flex-col items-end justify-center pr-2 py-2 gap-0 select-none shrink-0"
      >
        <span className="text-xs font-semibold uppercase tracking-wide leading-tight" style={{ color }}>{label}</span>
        <span className="text-[10px] text-slate-300 dark:text-[#555] leading-tight">fluid</span>
      </div>
      {rowCols.map(ci => {
        const committedSeg = segments.find(s => ci >= s.startCol && ci <= s.endCol)
        // While a grip is dragged the bar is drawn to the hover column, so the
        // extension is visible before it is committed.
        const previewSeg = !committedSeg && extendingFluid && extFluidHover !== null
          ? segments.find(s => s.id === extendingFluid && ci > s.endCol && ci <= extFluidHover) ?? null
          : null
        const seg = committedSeg ?? previewSeg
        const isDragPreview = !committedSeg && !!previewSeg
        const isActualStart = seg?.startCol === ci
        const isRowCont = !isActualStart && seg != null && ci === colStart
        const effectiveEnd = seg && extendingFluid === seg.id && extFluidHover !== null
          ? Math.max(extFluidHover, seg.startCol)
          : (seg?.endCol ?? -1)
        const isActualEnd = seg !== null && ci === effectiveEnd
        const isRowExit = seg != null && barContinues(seg.endCol, colEnd) && ci === colEnd - 1 && !isActualEnd
        const isSel = seg && sel?.type === "fluid" && sel.id === seg.id
        // A bag that was stopped earlier can be picked up again in this column.
        const stoppedSeg = !seg ? segments.find(s => s.stopped && s.endCol < ci) ?? null : null

        return (
          <div
            key={ci}
            style={{ width: colW, minWidth: colW }}
            className="group relative border-l border-slate-100 dark:border-[#2a2a2a] flex items-center"
            onDragOver={e => {
              if (!extendingFluid || e.dataTransfer.types.includes("extend-agent")) return
              e.preventDefault()
              e.stopPropagation()
              const s = segments.find(s => s.id === extendingFluid)
              if (s) dragActions.fluidExtendHover(Math.max(ci, s.startCol))
            }}
            onDrop={e => {
              if (!extendingFluid) return
              e.preventDefault()
              const s = segments.find(s => s.id === extendingFluid)
              if (s) extendFluid(extendingFluid, Math.max(ci, s.startCol))
              dragActions.fluidExtendEnd()
            }}
          >
            {seg && (
              <>
                <div
                  onClick={e => { e.stopPropagation(); if (isActualStart || isRowCont) setSel({ type: "fluid", id: seg.id }) }}
                  onDoubleClick={e => { e.stopPropagation(); if (seg.stopped) resumeFluid(seg.id) }}
                  title={seg.stopped ? "Double-click to resume" : undefined}
                  className={`absolute inset-y-1 border-y cursor-pointer ${barLeftClass(isActualStart || isRowCont)} ${barRightClass(seg.endCol, isActualEnd && !isRowExit, colEnd)} ${isDragPreview ? "opacity-50" : ""} ${seg.stopped ? "opacity-60 border-dashed" : ""}`}
                  style={{
                    backgroundColor: isSel ? color + "88" : color + "33",
                    borderColor: isSel ? color : color + "88",
                    boxShadow: isSel ? `0 0 0 1.5px ${color}` : undefined,
                  }}
                />
                {(isActualStart || isRowCont) && (() => {
                  const visStart = Math.max(seg.startCol, colStart)
                  const visEnd = Math.min(effectiveEnd, colEnd - 1)
                  const visW = (visEnd - visStart + 1) * colW
                  const rate = currentFluidRate(seg)
                  const concentration = seg.concentration ? ` ${seg.concentration}` : ""
                  const barLabel = seg.fluidEntryMode === "RATE"
                    ? `${displayFluidName(seg.name)}${concentration}${rate != null ? ` · ${rate} mL/h` : ""}`
                    : `${displayFluidName(seg.name)}${concentration}${(seg.bagVolumeMl ?? Number(seg.volume)) ? ` · ${seg.bagVolumeMl ?? seg.volume} mL` : ""}`

                  // A running rate is the thing most likely to change, so its
                  // label is the control that changes it.
                  return seg.fluidEntryMode === "RATE" && !seg.stopped ? (
                    <button
                      type="button"
                      title="Change fluid rate"
                      onClick={event => {
                        event.stopPropagation()
                        setSel({ type: "fluid", id: seg.id })
                        onChangeRate({
                          id: seg.id,
                          rate: rate == null ? "" : String(rate),
                          rect: event.currentTarget.getBoundingClientRect(),
                        })
                      }}
                      className="absolute top-1/2 -translate-y-1/2 z-20 select-none truncate px-1 text-[10px] font-bold"
                      style={{ color, left: 0, width: visW }}
                    >
                      {barLabel}
                    </button>
                  ) : (
                    <span
                      className="absolute top-1/2 -translate-y-1/2 z-10 pointer-events-none select-none truncate px-1 text-center text-[10px] font-bold"
                      style={{ color, left: 0, width: visW }}
                    >
                      {barLabel}
                    </span>
                  )
                })()}
              </>
            )}
            {showBarGrip(seg?.endCol ?? -1, isActualEnd, isDragPreview, colEnd) && !isRowExit && seg && !seg.stopped && (
              <div
                draggable
                onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("ext-fluid", seg.id); dragActions.fluidExtendStart(seg.id) }}
                onDragEnd={() => dragActions.fluidExtendEnd()}
                className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 opacity-70 hover:opacity-100 rounded-r-sm"
                style={{ backgroundColor: color }}
              >
                <span className="text-white text-[8px] font-bold select-none">|</span>
              </div>
            )}
            {isActualEnd && !isRowExit && seg && !seg.stopped && !isDragPreview && (
              <div
                className={`absolute z-30 flex items-center justify-center transition-opacity ${isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                style={{ top: 4, right: 14, bottom: 4 }}
              >
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    // A rate line's delivered volume is computable and is
                    // offered; a volume bag has to be asked about.
                    const isRate = seg.fluidEntryMode === "RATE"
                    onDiscontinue({
                      id: seg.id,
                      volInput: isRate ? String(fluidDeliveredVolumeMl(seg, new Date())) : "0",
                      rect: e.currentTarget.getBoundingClientRect(),
                      fullBag: isRate ? false : null,
                    })
                  }}
                  className="text-[8px] font-semibold bg-black/30 text-white px-1.5 py-0.5 rounded-full border border-white/30 hover:bg-red-500/80 whitespace-nowrap"
                >
                  ✕ Disc
                </button>
              </div>
            )}
            {(isActualStart || isRowCont) && seg && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); removeFluid(seg.id) }}
                className="absolute top-0.5 right-4 z-10 opacity-0 hover:opacity-100 [@media(hover:none)]:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
            {stoppedSeg && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); continueFluid(stoppedSeg, ci) }}
                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
              >
                <span className="text-[9px] font-bold text-emerald-500 dark:text-emerald-400 bg-white/80 dark:bg-black/40 px-1.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700 whitespace-nowrap">
                  Continue?
                </span>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
