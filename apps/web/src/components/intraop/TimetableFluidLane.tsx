"use client"

import { PlannedChangeMarker, PlannedStopMarker } from "./PlannedStopMarker"
import { SaveMark } from "./SaveMark"
import { TOUCH_GRIP } from "./touch-drag"
import { useTimetableMenu } from "./TimetableMenuHost"
import { segmentEventIds } from "@lospor/core/intraop-save-state"
import { currentFluidRate } from "@/lib/fluid-entry-ui"
import { barContinues, barLeftClass, barRightClass, barTimeInsets, showBarGrip } from "./timetable-row-geometry"
import type { TimetableDragActions, TimetableDragState } from "./use-timetable-drag"
import type { TtSel } from "./timetable-types"
import type { TimetableFluid } from "@/types/timetable"
import { useIntraopUiCopy } from "./ui-copy"
import { ChangeStripCell, stripStretches } from "./TimetableChangeStrip"
import { ttCell, ttLane } from "./chart-cursor"
import { runOnStripes } from "./run-on-stripes"
import { readableTextColor } from "@lospor/core/drug-colors"
import { LaneTotal, totalColumn } from "./lane-extras"
import { intraopFluidTotalLabel } from "@lospor/core/intraop-run-totals"
import { useLocale } from "next-intl"
import { runsOnAt } from "@lospor/core/intraop-summary"

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
  /** The end grip was dropped: the shared rule decides what, if anything, is written. */
  onEndDrop: (id: string, toCol: number) => void
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
  onEndDrop,
  onChangeRate,
}: FluidLaneProps) {
  const copy = useIntraopUiCopy()
  const menu = useTimetableMenu()
  const { extendingFluid, extFluidHover } = drag
  // 10.8.0: a cell of a running or stopped bag opens its menu (Stop, Change rate, Resume, ...).
  const openFluidMenu = (seg: TimetableFluid, ci: number, rect: DOMRect) =>
    !!menu?.openContinuous({ kind: "fluid", key: seg.id, col: ci, rect, title: displayFluidName(seg.name) })
  // 10.8.0: what runs now beside the name; the mL given after the bar.
  const nowCol = menu?.facts.nowCol ?? null
  const runningNow = nowCol == null ? null : segments.find(s => !s.stopped && !s.planned && s.startCol <= nowCol) ?? null
  const currentLabel = runningNow ? [displayFluidName(runningNow.name), currentFluidRate(runningNow) != null ? `${currentFluidRate(runningNow)} mL/h` : null].filter(Boolean).join(" · ") : null
  const language = useLocale() === "bg" ? "bg" : "en"
  // Core's total: how much, in how long, at what rate -- the same words as the PWA's row.
  const totalOf = (seg: TimetableFluid) => intraopFluidTotalLabel(seg, { now: new Date(), language }, seg.endCol)

  return (
    <div {...ttLane(`fluid:${label}`)} className="flex min-h-[44px] border-t border-slate-100 dark:border-[#2a2a2a] relative">
      <div
        data-tt-label
        style={{ width: labelWidth, minWidth: labelWidth }}
        className="flex flex-col items-end justify-center pr-2 py-2 gap-0 select-none shrink-0"
      >
        <span className="text-xs font-semibold uppercase tracking-wide leading-tight" style={{ color }}>{label}</span>
        <span title={currentLabel ?? undefined} className="line-clamp-1 text-xs text-slate-400 dark:text-[#777] leading-tight" data-testid="fluid-current">{currentLabel ?? copy.fluid.laneKind}</span>
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
        // Dragged back, the part the bar would give up is drawn faded, strip included.
        const cutOff = !!(committedSeg && extendingFluid === committedSeg.id && extFluidHover !== null && ci > effectiveEnd)
        // A rate line shows each rate it ran at in a strip above the bar (10.0.0); a bag does not.
        const isRate = seg?.fluidEntryMode === "RATE"
        const stretches = seg && isRate
          ? stripStretches(seg.startCol, seg.rate != null && seg.rate !== "" ? `${seg.rate} mL/h` : null,
            (seg.rateChanges ?? []).map(change => ({ col: change.col, label: `${change.rate} ${change.unit || "mL/h"}`, planned: change.planned })))
          : []
        const isRowExit = seg != null && barContinues(seg.endCol, colEnd) && ci === colEnd - 1 && !isActualEnd
        const isSel = seg && sel?.type === "fluid" && sel.id === seg.id
        // The real start and stop inside the cell; the column rule while a grip is dragged.
        const timed = seg && !isDragPreview && effectiveEnd === seg.endCol ? barTimeInsets(seg, colW) : { left: null, right: null }
        const timedLeft = isActualStart && timed.left != null ? { left: timed.left } : {}
        const timedRight = isActualEnd && !isRowExit && timed.right != null ? { right: timed.right } : {}
        // A bag that was stopped earlier can be picked up again in this column.
        const stoppedSeg = !seg ? segments.find(s => s.stopped && s.endCol < ci) ?? null : null
        // After now a running bag or rate runs on (Core runsOnAt, as the infusion lanes): a click there opens its menu,
        // dated to this cell (Plan a stop, Plan a change).
        const runOn = !seg && !stoppedSeg ? segments.find(s => runsOnAt(s, ci) || (!s.planned && !s.stopped && s.plannedStopCol === ci && ci > s.endCol)) ?? null : null

        return (
          <div
            key={ci}
            style={{ width: colW, minWidth: colW }}
            className="group relative border-l border-slate-100 dark:border-[#2a2a2a] flex items-center"
            {...ttCell(ci, seg ? { kind: "fluid", key: seg.id, col: ci } : null)}
            onClick={e => {
              const target = seg ?? stoppedSeg ?? runOn
              if (target) openFluidMenu(target, ci, (e.currentTarget as HTMLElement).getBoundingClientRect())
            }}
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
              if (s) onEndDrop(extendingFluid, Math.max(ci, s.startCol))
              dragActions.fluidExtendEnd()
            }}
          >
            {runOn && (
              <div data-testid="fluid-runs-on" aria-hidden className="absolute inset-y-1 left-0 right-0 rounded-sm pointer-events-none"
                style={{ ...runOnStripes(color, ci, colW), opacity: Math.max(0.08, 0.34 - 0.04 * (ci - (nowCol ?? ci))) }} />
            )}
            {!seg && segments.filter(s => !s.planned && totalColumn(s, nowCol) === ci).map(s => {
              return <LaneTotal key={s.id} text={totalOf(s)} color={color} testId="fluid-total" />
            })}
            {seg && (
              <>
                {isActualEnd && !isRowExit && <SaveMark eventIds={segmentEventIds(seg)} className="absolute top-0 right-0" />}
                {stretches.length > 0 && (
                  <ChangeStripCell
                    col={ci}
                    stretches={stretches}
                    color={color}
                    height={26}
                    top={6}
                    inline
                    roundStart={isActualStart || isRowCont}
                    roundEnd={isActualEnd && !isRowExit}
                    faded={!!seg.stopped || isDragPreview || cutOff}
                    selected={!!isSel}
                    timed={{ ...timedLeft, ...timedRight }}
                    onClick={event => {
                      setSel({ type: "fluid", id: seg.id })
                      if (openFluidMenu(seg, ci, event.currentTarget.getBoundingClientRect())) return
                      const current = currentFluidRate(seg)
                      if (!seg.stopped) onChangeRate({ id: seg.id, rate: current == null ? "" : String(current), rect: event.currentTarget.getBoundingClientRect() })
                    }}
                    testId="fluid-rate-strip" owner={`fluid:${seg.id}`} fullPrefix={displayFluidName(seg.name)}
                  />
                )}
                <div
                  onClick={e => { e.stopPropagation(); setSel({ type: "fluid", id: seg.id }); openFluidMenu(seg, ci, e.currentTarget.getBoundingClientRect()) }}
                  className={`tt-bar ${isActualEnd && !isRowExit && !seg.planned ? (seg.stopped ? "tt-end tt-stopnotch" : "tt-end tt-live") : ""} absolute inset-y-1 cursor-pointer ${barLeftClass(isActualStart || isRowCont)} ${barRightClass(seg.endCol, isActualEnd && !isRowExit, colEnd)} ${isDragPreview || cutOff ? "opacity-50" : ""} ${seg.planned ? "opacity-40 border-dashed" : seg.stopped ? "opacity-60 border-dashed" : ""}`}
                  style={{
                    ...timedLeft,
                    ...timedRight,
                    background: `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 74%, #000))`,
                    boxShadow: isSel ? "0 0 0 2px #fff, inset 0 1px 0 rgba(255,255,255,.35)" : "inset 0 1px 0 rgba(255,255,255,.35), 0 1px 5px rgba(0,0,0,.3)",
                  }}
                />
                {(isActualStart || isRowCont) && (() => {
                  const visStart = Math.max(seg.startCol, colStart)
                  const visEnd = Math.min(effectiveEnd, colEnd - 1)
                  const visW = (visEnd - visStart + 1) * colW
                  const rate = currentFluidRate(seg)
                  const concentration = seg.concentration ? ` ${seg.concentration}` : ""
                  // The rate itself is on the strip above.
                  const barLabel = seg.fluidEntryMode === "RATE"
                    ? `${displayFluidName(seg.name)}${concentration}`
                    : `${displayFluidName(seg.name)}${concentration}${(seg.bagVolumeMl ?? Number(seg.volume)) ? ` · ${seg.bagVolumeMl ?? seg.volume} mL` : ""}`

                  // A running rate is the thing most likely to change, so its
                  // label is the control that changes it.
                  return seg.fluidEntryMode === "RATE" && !seg.stopped ? (
                    <button
                      type="button"
                      title={copy.fluid.changeRate}
                      onClick={event => {
                        event.stopPropagation()
                        setSel({ type: "fluid", id: seg.id })
                        if (openFluidMenu(seg, ci, event.currentTarget.getBoundingClientRect())) return
                        onChangeRate({
                          id: seg.id,
                          rate: rate == null ? "" : String(rate),
                          rect: event.currentTarget.getBoundingClientRect(),
                        })
                      }}
                      data-tt-full={barLabel} data-tt-owner={`fluid:${seg.id}`} className={`${seg.stopped ? "" : "tt-onbar"} absolute top-1/2 -translate-y-1/2 z-20 select-none truncate px-1 text-xs font-bold`}
                      style={{ color, ["--tt-on" as string]: readableTextColor(color), left: 0, width: visW, top: "calc(50% + 14px)" }}
                    >
                      {barLabel}
                    </button>
                  ) : (
                    <span
                      data-tt-full={barLabel} data-tt-owner={`fluid:${seg.id}`} className={`${seg.stopped ? "" : "tt-onbar"} absolute top-1/2 -translate-y-1/2 z-10 pointer-events-none select-none truncate px-1 text-center text-xs font-bold`}
                      style={{ color, ["--tt-on" as string]: readableTextColor(color), left: 0, width: visW, ...(isRate ? { top: "calc(50% + 14px)" } : {}) }}
                    >
                      {barLabel}
                    </span>
                  )
                })()}
              </>
            )}
            {showBarGrip(seg?.endCol ?? -1, isActualEnd, isDragPreview, colEnd) && !isRowExit && seg && (
              <div
                draggable
                onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("ext-fluid", seg.id); dragActions.fluidExtendStart(seg.id) }}
                onDragEnd={() => dragActions.fluidExtendEnd()}
                className={`tt-grip absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 opacity-70 hover:opacity-100 rounded-r-sm ${TOUCH_GRIP}`}
                style={{ backgroundColor: color, ...timedRight }}
              >
                <span className="text-white text-xs font-bold select-none">|</span>
              </div>
            )}
            {segments.some(s => s.plannedStopCol === ci) && <PlannedStopMarker />}
            {segments.flatMap(s => (s.rateChanges ?? []).filter(rc => rc.planned && rc.col === ci))
              .map(rc => <PlannedChangeMarker key={rc.eventId ?? rc.col} value={`${rc.rate} ${rc.unit}`} />)}
          </div>
        )
      })}
    </div>
  )
}
