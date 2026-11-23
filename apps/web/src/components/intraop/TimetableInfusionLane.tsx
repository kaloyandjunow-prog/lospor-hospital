"use client"

import { runsOnAt } from "@lospor/core/intraop-summary"
import { TOUCH_GRIP } from "./touch-drag"
import { PlannedChangeMarker, PlannedStopMarker } from "./PlannedStopMarker"
import { useTciLanePredictions } from "./TciLaneOverlay"
import { SaveMark } from "./SaveMark"
import { segmentEventIds } from "@lospor/core/intraop-save-state"
import { useTimetableMenu } from "./TimetableMenuHost"
import { ExtendGhost, ghostGripVisible } from "./InfusionGhostBars"
import { barContinues, barLeftClass, barRightClass, barTimeInsets } from "./timetable-row-geometry"
import type { TimetableDragActions, TimetableDragState } from "./use-timetable-drag"
import type { TtSel } from "./timetable-types"
import type { TimetableInfusion } from "@/types/timetable"
import { useIntraopUiCopy } from "./ui-copy"
import { ChangeStripCell, stripStretches, type StripStretch } from "./TimetableChangeStrip"
import { InfusionRateStrip } from "./InfusionRateStrip"
import { ttCell, ttLane } from "./chart-cursor"
import { runOnStripes } from "./run-on-stripes"
import { LaneTotal, totalColumn } from "./lane-extras"
import { intraopInfusionTotalLabel } from "@lospor/core/intraop-run-totals"
import type { TciPatient } from "@lospor/core/tci"
import { useLocale } from "next-intl"

/** An infusion's applied rates as strip stretches, for the ghost drawn while it is dragged. */
function infusionStretches(seg: TimetableInfusion): StripStretch[] {
  return stripStretches(seg.startCol, `${seg.rate} ${seg.unit}`,
    (seg.rateChanges ?? []).map(change => ({ col: change.col, label: `${change.rate} ${change.unit}`, planned: change.planned })))
}

/**
 * One infusion lane: a drug running over time, with the rate it ran at.
 *
 * This is the busiest lane on the chart because an infusion can be changed in
 * four different ways, and all four have to be visible while they are being
 * done rather than only after. The bar can be dragged whole to a different
 * time; either end can be dragged to make it longer or shorter; and a rate
 * change can be slid to a different column when it was entered against the
 * wrong one. Each of those draws a ghost while the drag is in progress, so the
 * result is seen before the mouse is released.
 *
 * The lane is two stacked bands, not one: the rate strip on top and the
 * infusion bar below. They share left/right geometry deliberately, so the two
 * read as a single object even though only the lower band can be dragged.
 *
 * Dragging a bar off the left-hand edge of the chart is treated as an intent to
 * delete rather than as a move to a negative time, and asks before doing it.
 *
 * Presentational: every change goes back through the callbacks.
 */

/** A rate change picked up to be slid to another column. */
export type RatePillMove = {
  infId: string
  fromCol: number
  rate: number
  unit: string
  /** Carried with the change when it is slid: both rates stay together (2026-10-18). */
  concentration?: string
  volumeRateMlPerHour?: number
}

export type InfusionMenuRequest = {
  segId: string
  name: string
  color: string
  rect: DOMRect
  stopped: boolean
  fromPillCol: number
}

export type InfusionLaneProps = {
  /** Lane heading — the infusion's own name, untranslated. */
  drugName: string
  color: string
  segments: TimetableInfusion[]
  labelWidth: number
  /** Absolute column indices this chart row covers. */
  rowCols: number[]
  colStart: number
  colEnd: number
  colW: number
  nowCol: number | null
  sel: TtSel | null
  setSel: (update: (current: TtSel | null) => TtSel | null) => void
  clearSel: () => void
  displayInfusionName: (name: string) => string

  /** Id of the bar whose Discontinue is awaiting confirmation. */
  discConfirmId: string | null
  setDiscConfirmId: (id: string | null) => void
  /** Id of the bar the Discontinue menu item is hovering, drawn as about to end. */
  hoverDiscontinue: string | null

  drag: TimetableDragState
  dragActions: TimetableDragActions

  extendInfusion: (id: string, toCol: number) => void
  /** The end grip was dropped: the shared rule decides what, if anything, is written. */
  onEndDrop: (id: string, toCol: number) => void
  extendInfusionLeft: (id: string, toCol: number) => void
  applyInfRateChange: (infId: string, fromCol: number | null, toCol: number, change: { rate: number; unit: string; concentration?: string; volumeRateMlPerHour?: number }) => void
  onOpenMenu: (request: InfusionMenuRequest) => void
  /** A live case not yet ended: a running infusion runs on in the cells after now (9.13.1). */
  projectRunning?: boolean
}

export function InfusionLane({
  drugName,
  color,
  segments,
  labelWidth,
  rowCols,
  colStart,
  colEnd,
  colW,
  sel,
  setSel,
  displayInfusionName,
  hoverDiscontinue,
  drag,
  dragActions,
  onEndDrop,
  extendInfusionLeft,
  applyInfRateChange,
  onOpenMenu,
  projectRunning = false,
}: InfusionLaneProps) {
  const copy = useIntraopUiCopy()
  const menu = useTimetableMenu()
  // 10.8.0: any cell of an infusion opens its menu (Stop, Change dose, Change syringe, ...);
  // the infusion's own menu is the fallback where the shared one has nothing to offer.
  const openMenu = (request: InfusionMenuRequest) => {
    if (menu?.openContinuous({ kind: "infusion", key: request.segId, col: request.fromPillCol, rect: request.rect, title: displayInfusionName(request.name) })) return
    onOpenMenu(request)
  }
  const { movingRatePill, extendingInf, extInfHover, extendingInfLeft, extInfLeftHover } = drag
  const isBusyMovingPill = movingRatePill !== null && segments.some(s => s.id === movingRatePill.infId)
  // A TCI bar shows its target and the predicted concentration line (2026-10-18).
  const tciPredictions = useTciLanePredictions(segments)
  // 10.8.0: the name on the left carries the rate in force now; the amount given goes after the bar.
  const facts = menu?.facts
  const nowCol = facts?.nowCol ?? null
  const runningNow = nowCol == null ? null : segments.find(s => !s.stopped && !s.planned && s.startCol <= nowCol) ?? null
  const currentRate = runningNow && nowCol != null ? (() => {
    const change = (runningNow.rateChanges ?? []).filter(rc => !rc.planned && rc.col <= nowCol).sort((a, b) => a.col - b.col).pop()
    return `${change?.rate ?? runningNow.rate} ${change?.unit ?? runningNow.unit}`
  })() : null
  const language = useLocale() === "bg" ? "bg" : "en"
  // Core's total: the amount and how long, the same words as the PWA's row.
  const totalOf = (seg: TimetableInfusion) => intraopInfusionTotalLabel(seg, { ibw: facts?.ibw ?? null, tbw: facts?.tbw ?? null, tciPatient: (facts?.tciPatient ?? null) as TciPatient | null, now: new Date(), language })

  return (
    <div
      data-testid="infusion-lane"
      {...ttLane(`infusion:${drugName}`)}
      className="flex items-stretch border-t border-slate-100 dark:border-[#2a2a2a] relative"
      style={{ minHeight: 40 }}
    >
      <div
        data-tt-label
        style={{ width: labelWidth, minWidth: labelWidth }}
        className="flex flex-col items-end justify-center pr-2 py-1 gap-0 select-none shrink-0"
      >
        <span className="text-xs font-semibold uppercase tracking-wide leading-tight" style={{ color }}>{displayInfusionName(drugName)}</span>
        <span className="text-xs text-slate-400 dark:text-[#777] leading-tight" data-testid="infusion-current-rate">{currentRate ?? copy.infusion.laneKind}</span>
      </div>
      {rowCols.map(ci => {
        const seg = segments.find(s => ci >= s.startCol && ci <= s.endCol)
        // Right-grip extension preview: cells beyond seg.endCol, up to the hover.
        const rightPreviewSeg = !seg && extendingInf
          ? segments.find(s => s.id === extendingInf && ci > s.endCol && extInfHover !== null && ci <= extInfHover) ?? null
          : null
        // Left-grip extension preview: cells before seg.startCol, down to the hover.
        const leftPreviewSeg = !seg && extendingInfLeft
          ? segments.find(s => s.id === extendingInfLeft && extInfLeftHover !== null && ci >= extInfLeftHover && ci < s.startCol) ?? null
          : null
        // The drawn end follows the right grip while it is being dragged.
        const effectiveEnd = seg && extendingInf === seg.id && extInfHover !== null
          ? Math.max(extInfHover, seg.startCol)
          : (seg?.endCol ?? -1)
        const isActualStart = seg?.startCol === ci
        const isActualEnd = seg !== null && ci === effectiveEnd
        const isRowCont = !isActualStart && seg != null && ci === colStart
        const isRowExit = seg != null && barContinues(effectiveEnd, colEnd) && ci === colEnd - 1 && !isActualEnd
        const isSelected = seg != null && sel?.type === "infusion" && sel.id === seg.id
        // Dragged back, the part the bar would give up is drawn faded, strip included.
        const cutOff = !!(seg && extendingInf === seg.id && extInfHover !== null && ci > effectiveEnd)
        // The real start and stop inside the cell; the column rule while a grip is dragged.
        const timed = seg && effectiveEnd === seg.endCol ? barTimeInsets(seg, colW) : { left: null, right: null }
        const timedLeft = isActualStart && timed.left != null ? { left: timed.left } : {}
        const timedRight = isActualEnd && !isRowExit && timed.right != null ? { right: timed.right } : {}

        return (
          <div
            key={ci}
            style={{ width: colW, minWidth: colW }}
            className="relative border-l border-slate-100 dark:border-[#2a2a2a]"
            {...ttCell(ci, seg ? { kind: "infusion", key: seg.id, col: ci } : null)}
            onDragOver={e => {
              if (extendingInf) {
                e.preventDefault(); e.stopPropagation()
                const s = segments.find(s => s.id === extendingInf)
                if (s) dragActions.infusionExtendHover(Math.max(ci, s.startCol), "right")
              } else if (extendingInfLeft) {
                e.preventDefault(); e.stopPropagation()
                const s = segments.find(s => s.id === extendingInfLeft)
                if (s && ci <= s.endCol) dragActions.infusionExtendHover(Math.max(0, ci), "left")
              } else if (isBusyMovingPill) {
                e.preventDefault()
              }
            }}
            onDrop={e => {
              if (extendingInf) {
                e.preventDefault()
                const s = segments.find(s => s.id === extendingInf)
                if (s) onEndDrop(extendingInf, Math.max(ci, s.startCol))
                dragActions.infusionExtendEnd("right")
              } else if (extendingInfLeft) {
                e.preventDefault()
                extendInfusionLeft(extendingInfLeft, Math.max(0, extInfLeftHover ?? ci))
                dragActions.infusionExtendEnd("left")
              } else if (isBusyMovingPill) {
                e.preventDefault()
                // Only lands where an infusion is running; fromCol null keeps
                // the original change in place rather than moving it.
                if (seg) applyInfRateChange(movingRatePill!.infId, null, ci, movingRatePill!)
                dragActions.ratePillEnd()
              }
            }}
          >
            {!seg && segments.filter(s => !s.planned && totalColumn(s, nowCol) === ci).map(s => {
              const total = totalOf(s)
              return total ? <LaneTotal key={s.id} text={total} color={color} testId="infusion-total" /> : null
            })}
            {segments.some(s => s.plannedStopCol === ci) && <PlannedStopMarker />}
            {/* After now, a running infusion runs on (Core runsOnAt, the PWA's rule): dashed, and a
                click opens its menu dated to this cell -- a planned change of this infusion,
                never a second one of the same drug (9.13.1). */}
            {!seg && projectRunning && (() => {
              // The cell of a planned stop is still running (it stops when its time comes): its menu offers to remove the plan.
              const runOn = segments.find(s => runsOnAt(s, ci) || (!s.planned && !s.stopped && s.plannedStopCol === ci && ci > s.endCol))
              return runOn ? (
                <button
                  type="button"
                  data-testid="infusion-runs-on"
                  aria-label={displayInfusionName(runOn.name)}
                  className="absolute top-[6px] bottom-1 left-0 right-0 z-10 rounded-sm hover:!opacity-100"
                  style={{ ...runOnStripes(color, ci, colW), opacity: Math.max(0.08, 0.34 - 0.04 * (ci - (nowCol ?? ci))) }}
                  onClick={e => {
                    e.stopPropagation()
                    openMenu({ segId: runOn.id, name: runOn.name, color, rect: e.currentTarget.getBoundingClientRect(), stopped: false, fromPillCol: ci })
                  }}
                />
              ) : null
            })()}
            {segments.flatMap(s => (s.rateChanges ?? []).filter(rc => rc.planned && rc.col === ci))
              .map(rc => <PlannedChangeMarker key={rc.eventId ?? rc.col} value={`${rc.rate} ${rc.unit}`} />)}
            {/* Rate strip — shares the bar's geometry so the two read as one object.
                It stays after the infusion is stopped, faded: the record of what ran
                and at which rates is exactly what a stopped bar is for. */}
             {seg && <InfusionRateStrip seg={seg} ci={ci} color={color} isActualStart={isActualStart} isRowCont={isRowCont} isActualEnd={isActualEnd} isRowExit={isRowExit} isSelected={isSelected} cutOff={cutOff} timedLeft={timedLeft} timedRight={timedRight} dragActions={dragActions} onOpenMenu={openMenu} prediction={tciPredictions.get(seg.id)} />}

            {seg && (
              <>
                {isActualEnd && !isRowExit && <SaveMark eventIds={segmentEventIds(seg)} className="absolute top-5 right-0" />}
                <div
                  onClick={e => {
                    e.stopPropagation()
                    setSel(() => ({ type: "infusion", id: seg.id }))
                    openMenu({ segId: seg.id, name: seg.name, color, rect: e.currentTarget.getBoundingClientRect(), stopped: !!seg.stopped, fromPillCol: ci })
                  }}
                  className={`tt-bar ${isActualEnd && !isRowExit && !seg.planned ? (seg.stopped ? "tt-end tt-stopnotch" : "tt-end tt-live") : ""} absolute left-0 right-0 cursor-pointer ${barLeftClass(isActualStart || isRowCont)} ${barRightClass(seg.endCol, isActualEnd && !isRowExit, colEnd)} ${seg.planned ? "opacity-40 border-dashed" : seg.stopped ? "opacity-50 border-dashed" : hoverDiscontinue === seg.id || cutOff ? "opacity-50" : ""}`}
                  style={{
                    top: 6,
                    bottom: 4,
                    ...timedLeft,
                    ...timedRight,
                    background: `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 74%, #000))`,
                    boxShadow: isSelected ? "0 0 0 2px #fff, inset 0 1px 0 rgba(255,255,255,.35)" : "inset 0 1px 0 rgba(255,255,255,.35), 0 1px 5px rgba(0,0,0,.3)",
                  }}
                >
                </div>

                {/* Grips appear only on the selected bar, so an unselected chart
                    stays readable rather than sprouting handles everywhere. */}
                {isActualStart && !seg.stopped && (
                  <div
                    draggable
                    onDragStart={e => { e.stopPropagation(); dragActions.infusionExtendStart(seg.id, "left") }}
                    onDragEnd={() => dragActions.infusionExtendEnd("left")}
                    className={`tt-grip absolute left-0 z-20 flex items-center justify-center cursor-col-resize rounded-l-sm ${TOUCH_GRIP}`}
                    style={{ top: 6, bottom: 4, width: 10, backgroundColor: color, ...timedLeft }}
                  >
                    <span className="text-white text-xs font-bold select-none">|</span>
                  </div>
                )}
                {isActualEnd && !isRowExit && (
                  <div
                    draggable
                    onDragStart={e => { e.stopPropagation(); dragActions.infusionExtendStart(seg.id, "right") }}
                    onDragEnd={() => dragActions.infusionExtendEnd("right")}
                    className={`tt-grip absolute right-0 z-20 flex items-center justify-center cursor-col-resize rounded-r-sm ${TOUCH_GRIP}`}
                    style={{ top: 6, bottom: 4, width: 10, backgroundColor: color, ...timedRight }}
                  >
                    <span className="text-white text-xs font-bold select-none">|</span>
                  </div>
                )}
              </>
            )}

            {rightPreviewSeg && (
              <ChangeStripCell col={ci} stretches={infusionStretches(rightPreviewSeg)} color={color} height={21}
                roundStart={false} roundEnd={ci === extInfHover} faded testId="infusion-strip-ghost" />
            )}
            {leftPreviewSeg && (
              <ChangeStripCell col={leftPreviewSeg.startCol} stretches={infusionStretches(leftPreviewSeg)} color={color} height={21}
                roundStart={extInfLeftHover !== null && ci === extInfLeftHover} roundEnd={false} faded testId="infusion-strip-ghost" />
            )}
            {rightPreviewSeg && (
              <ExtendGhost
                color={color}
                side="right"
                atHoverEdge={ci === extInfHover}
                showGrip={ghostGripVisible(sel, rightPreviewSeg.id)}
              />
            )}
            {leftPreviewSeg && (
              <ExtendGhost
                color={color}
                side="left"
                atHoverEdge={extInfLeftHover !== null && ci === extInfLeftHover}
                showGrip={ghostGripVisible(sel, leftPreviewSeg.id)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
