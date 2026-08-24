"use client"

import { DiscontinuePrompt } from "./DiscontinuePrompt"
import { ExtendGhost, MoveGhost, ghostGripVisible } from "./InfusionGhostBars"
import { barContinues, barLeftClass, barRightClass } from "./timetable-row-geometry"
import type { TimetableDragActions, TimetableDragState } from "./use-timetable-drag"
import type { TtSel } from "./timetable-types"
import type { TimetableInfusion } from "@/types/timetable"
import { useIntraopUiCopy } from "./ui-copy"

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

/** A bar picked up for a whole-bar move. */
export type InfusionBarMove = {
  id: string
  origStart: number
  origEnd: number
  fromCol: number
}

/** A rate change picked up to be slid to another column. */
export type RatePillMove = {
  infId: string
  fromCol: number
  rate: number
  unit: string
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

  extendInfusion: (id: string, toCol: number, stop?: boolean) => void
  extendInfusionLeft: (id: string, toCol: number) => void
  applyInfRateChange: (infId: string, fromCol: number | null, toCol: number, rate: number, unit: string) => void
  /** Commit a whole-bar move; the owner decides move versus delete-prompt. */
  onMoveBar: (move: InfusionBarMove, toCol: number) => void
  onOpenMenu: (request: InfusionMenuRequest) => void
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
  nowCol,
  sel,
  setSel,
  clearSel,
  displayInfusionName,
  discConfirmId,
  setDiscConfirmId,
  hoverDiscontinue,
  drag,
  dragActions,
  extendInfusion,
  extendInfusionLeft,
  applyInfRateChange,
  onMoveBar,
  onOpenMenu,
}: InfusionLaneProps) {
  const copy = useIntraopUiCopy()
  const { movingInf, movingInfCol, movingRatePill, extendingInf, extInfHover, extendingInfLeft, extInfLeftHover } = drag
  const isBusyMovingBar = movingInf !== null && segments.some(s => s.id === movingInf.id)
  const isBusyMovingPill = movingRatePill !== null && segments.some(s => s.id === movingRatePill.infId)

  return (
    <div
      data-testid="infusion-lane"
      className="flex items-stretch border-t border-slate-100 dark:border-[#2a2a2a] relative"
      style={{ minHeight: 52 }}
    >
      <div
        style={{ width: labelWidth, minWidth: labelWidth }}
        className="flex flex-col items-end justify-end pr-2 pb-1.5 gap-0 select-none shrink-0"
      >
        <span className="text-xs font-semibold uppercase tracking-wide leading-tight" style={{ color }}>{drugName}</span>
        <span className="text-[10px] text-slate-300 dark:text-[#555] leading-tight">{copy.infusion.laneKind}</span>
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
        // Whole-bar move preview position.
        const previewStart = isBusyMovingBar && movingInfCol !== null
          ? movingInf!.origStart + (movingInfCol - movingInf!.fromCol)
          : null
        const previewEnd = previewStart !== null ? previewStart + (movingInf!.origEnd - movingInf!.origStart) : null
        const isPreview = !seg && !rightPreviewSeg && !leftPreviewSeg
          && previewStart !== null && previewEnd !== null && ci >= previewStart && ci <= previewEnd
        // The drawn end follows the right grip while it is being dragged.
        const effectiveEnd = seg && extendingInf === seg.id && extInfHover !== null
          ? Math.max(extInfHover, seg.startCol)
          : (seg?.endCol ?? -1)
        const isActualStart = seg?.startCol === ci
        const isActualEnd = seg !== null && ci === effectiveEnd
        const isRowCont = !isActualStart && seg != null && ci === colStart
        const isRowExit = seg != null && barContinues(effectiveEnd, colEnd) && ci === colEnd - 1 && !isActualEnd
        const isSelected = seg != null && sel?.type === "infusion" && sel.id === seg.id

        return (
          <div
            key={ci}
            style={{ width: colW, minWidth: colW }}
            className="relative border-l border-slate-100 dark:border-[#2a2a2a]"
            onDragOver={e => {
              if (extendingInf) {
                e.preventDefault(); e.stopPropagation()
                const s = segments.find(s => s.id === extendingInf)
                if (s) dragActions.infusionExtendHover(Math.max(ci, s.startCol), "right")
              } else if (extendingInfLeft) {
                e.preventDefault(); e.stopPropagation()
                const s = segments.find(s => s.id === extendingInfLeft)
                if (s && ci <= s.endCol) dragActions.infusionExtendHover(Math.max(0, ci), "left")
              } else if (isBusyMovingBar) {
                e.preventDefault(); dragActions.infusionMoveHover(ci)
              } else if (isBusyMovingPill) {
                e.preventDefault()
              }
            }}
            onDrop={e => {
              if (extendingInf) {
                e.preventDefault()
                const s = segments.find(s => s.id === extendingInf)
                if (s) extendInfusion(extendingInf, Math.max(ci, s.startCol))
                dragActions.infusionExtendEnd("right")
              } else if (extendingInfLeft) {
                e.preventDefault()
                extendInfusionLeft(extendingInfLeft, Math.max(0, extInfLeftHover ?? ci))
                dragActions.infusionExtendEnd("left")
              } else if (isBusyMovingBar) {
                e.preventDefault()
                onMoveBar(movingInf!, ci)
                dragActions.infusionMoveEnd()
              } else if (isBusyMovingPill) {
                e.preventDefault()
                // Only lands where an infusion is running; fromCol null keeps
                // the original change in place rather than moving it.
                if (seg) applyInfRateChange(movingRatePill!.infId, null, ci, movingRatePill!.rate, movingRatePill!.unit)
                dragActions.ratePillEnd()
              }
            }}
          >
            {/* Rate strip — shares the bar's geometry so the two read as one object. */}
            {seg && !seg.stopped && (() => {
              const sortedChanges = (seg.rateChanges ?? []).slice().sort((a, b) => a.col - b.col)
              const prevChange = sortedChanges.filter(rc => rc.col <= ci).pop()
              const curRate = prevChange?.rate ?? seg.rate
              const curUnit = prevChange?.unit ?? seg.unit
              const isSegStart = ci === seg.startCol || sortedChanges.some(rc => rc.col === ci)
              const isRateChangeCol = sortedChanges.some(rc => rc.col === ci)
              const leftStyle = (isActualStart || isRowCont) ? "left-1" : "left-0"
              const rightStyle = (isActualEnd && !isRowExit) ? "right-3" : "right-0"
              const tlRadius = (isActualStart || isRowCont) ? "rounded-tl-full" : ""
              const trRadius = (isActualEnd && !isRowExit) ? "rounded-tr-sm" : ""
              return (
                <div
                  className={`absolute top-0 z-20 flex items-center cursor-pointer select-none hover:opacity-90 transition-opacity overflow-hidden ${leftStyle} ${rightStyle} ${tlRadius} ${trRadius}`}
                  style={{ height: 21, backgroundColor: color + (isSelected ? "50" : "2e") }}
                  onClick={e => {
                    e.stopPropagation()
                    onOpenMenu({
                      segId: seg.id,
                      name: seg.name,
                      color,
                      rect: e.currentTarget.getBoundingClientRect(),
                      stopped: false,
                      fromPillCol: ci,
                    })
                  }}
                >
                  {/* The boundary between two rates, draggable to another column. */}
                  {isRateChangeCol && (
                    <div
                      draggable
                      className="absolute left-0 top-1 bottom-1 w-[2px] cursor-col-resize z-30 rounded-full opacity-70 hover:opacity-100"
                      style={{ backgroundColor: color }}
                      onDragStart={e => {
                        e.stopPropagation()
                        const rc = sortedChanges.find(r => r.col === ci)!
                        dragActions.ratePillStart({ infId: seg.id, fromCol: ci, rate: Number(rc.rate) || 0, unit: rc.unit })
                      }}
                      onDragEnd={() => dragActions.ratePillEnd()}
                      onClick={e => e.stopPropagation()}
                    />
                  )}
                  {isSegStart && (
                    <span
                      className="text-[8px] font-bold whitespace-nowrap truncate leading-none"
                      style={{ color, paddingLeft: isRateChangeCol ? 10 : 5 }}
                    >
                      {curRate} {curUnit}
                    </span>
                  )}
                </div>
              )
            })()}

            {seg && (
              <>
                <div
                  draggable={!seg.stopped}
                  onDragStart={!seg.stopped
                    ? e => { e.stopPropagation(); dragActions.infusionMoveStart({ id: seg.id, origStart: seg.startCol, origEnd: seg.endCol, fromCol: ci }) }
                    : undefined}
                  onDragEnd={() => dragActions.infusionMoveEnd()}
                  onClick={e => { e.stopPropagation(); setSel(s => s?.type === "infusion" && s.id === seg.id ? null : { type: "infusion", id: seg.id }) }}
                  title={!seg.stopped ? copy.infusionBarHelp : undefined}
                  className={`absolute left-0 right-0 border-y ${!seg.stopped ? "cursor-grab active:cursor-grabbing" : ""} ${barLeftClass(isActualStart || isRowCont)} ${barRightClass(seg.endCol, isActualEnd && !isRowExit, colEnd)} ${seg.stopped ? "opacity-50 border-dashed" : hoverDiscontinue === seg.id ? "opacity-50" : ""}`}
                  style={{
                    top: 22,
                    bottom: 4,
                    backgroundColor: isSelected ? color + "99" : color + "44",
                    borderColor: isSelected ? color : color + "88",
                    borderStyle: seg.stopped || hoverDiscontinue === seg.id ? "dashed" : "solid",
                    boxShadow: isSelected ? `0 0 0 1.5px ${color}` : undefined,
                  }}
                >
                  {(isActualStart || isRowCont) && (() => {
                    const visStart = Math.max(seg.startCol, colStart)
                    const visEnd = Math.min(seg.endCol, colEnd - 1)
                    return (
                      <span
                        className="absolute top-1/2 -translate-y-1/2 text-[10px] font-bold whitespace-nowrap pointer-events-none select-none text-center block"
                        style={{ color, left: 0, width: (visEnd - visStart + 1) * colW }}
                      >
                        {displayInfusionName(seg.name)}
                      </span>
                    )
                  })()}
                </div>

                {/* Grips appear only on the selected bar, so an unselected chart
                    stays readable rather than sprouting handles everywhere. */}
                {isActualStart && isSelected && !seg.stopped && (
                  <div
                    draggable
                    onDragStart={e => { e.stopPropagation(); dragActions.infusionExtendStart(seg.id, "left") }}
                    onDragEnd={() => dragActions.infusionExtendEnd("left")}
                    className="absolute left-0 z-20 flex items-center justify-center cursor-col-resize rounded-l-sm"
                    style={{ top: 22, bottom: 4, width: 10, backgroundColor: color }}
                  >
                    <span className="text-white text-[8px] font-bold select-none">|</span>
                  </div>
                )}
                {isActualEnd && isSelected && !seg.stopped && !isRowExit && (
                  <div
                    draggable
                    onDragStart={e => { e.stopPropagation(); dragActions.infusionExtendStart(seg.id, "right") }}
                    onDragEnd={() => dragActions.infusionExtendEnd("right")}
                    className="absolute right-0 z-20 flex items-center justify-center cursor-col-resize rounded-r-sm"
                    style={{ top: 22, bottom: 4, width: 10, backgroundColor: color }}
                  >
                    <span className="text-white text-[8px] font-bold select-none">|</span>
                  </div>
                )}
                {isActualEnd && !isRowExit && isSelected && !seg.stopped && (
                  <DiscontinuePrompt
                    open={discConfirmId === seg.id}
                    onOpen={() => setDiscConfirmId(seg.id)}
                    onConfirm={() => { extendInfusion(seg.id, nowCol ?? seg.endCol, true); clearSel(); setDiscConfirmId(null) }}
                    onCancel={() => setDiscConfirmId(null)}
                    style={{ top: 24, right: 14 }}
                    cancelClassName="text-[8px] text-white/60 hover:text-white px-1 whitespace-nowrap"
                  />
                )}
              </>
            )}

            {isPreview && (
              <MoveGhost color={color} isFirst={ci === previewStart} isLast={ci === previewEnd} />
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
