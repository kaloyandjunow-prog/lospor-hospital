"use client"

import { X } from "lucide-react"
import { displayGasMix, displayGasSettings } from "@/lib/clinical-display"
import { DiscontinuePrompt } from "./DiscontinuePrompt"
import { barContinues, barEntersRow, barLeftClass, barRightClass, showBarGrip } from "./timetable-row-geometry"
import type { TimetableDragState } from "./use-timetable-drag"
import type { TtSel } from "./timetable-types"
import type { AgentSegment, GasSettingsSegment } from "@/types/timetable"
import { gasSettingsAtColumn } from "@lospor/core/intraop-summary"
import { useIntraopUiCopy } from "./ui-copy"

/**
 * The two lanes that record what the patient is breathing: the volatile agent,
 * and the fresh gas it is carried in.
 *
 * Both are span lanes rather than point lanes — an agent runs from the column
 * it was started in until it is stopped, and it can cross the edge of a chart
 * row, so each cell has to know whether it is the start, the end, a
 * continuation from the row above, or an exit into the row below. Getting that
 * wrong draws a bar with two rounded ends in the middle of an anaesthetic.
 *
 * A stopped segment stays on the chart. It is drawn faded and dashed and can be
 * resumed or continued in a later column, because an agent that ran and was
 * turned off is part of what happened.
 *
 * Presentational: every change goes back through the callbacks.
 */

export type AgentStyle = { bar: string; text: string; grip: string }

/** Geometry and chrome shared by both lanes. */
type LaneChrome = {
  labelWidth: number
  rowLabelClass: string
  /** Absolute column indices this chart row covers. */
  rowCols: number[]
  colStart: number
  colEnd: number
  colW: number
  nowCol: number | null
  sel: TtSel | null
  setSel: (sel: TtSel | null) => void
  /** Which segment is currently showing its confirm-discontinue prompt. */
  discConfirmId: string | null
  setDiscConfirmId: (id: string | null) => void
}

export type AgentLaneProps = LaneChrome & {
  label: string
  agents: AgentSegment[]
  /** The committed segment covering this column, if any. */
  segmentAt: (col: number) => AgentSegment | null
  agentStyle: Record<string, AgentStyle>
  displayAgentName: (name: string) => string
  drag: TimetableDragState
  onCellDragOver: (event: React.DragEvent, col: number) => void
  onCellDrop: (event: React.DragEvent, col: number) => void
  onGripDragStart: (event: React.DragEvent, startCol: number) => void
  onDragEnd: () => void
  openPickerForSeg: (col: number, seg: AgentSegment, rect: DOMRect) => void
  openPickerEmpty: (col: number, rect: DOMRect) => void
  resumeSegment: (startCol: number) => void
  extendSegment: (startCol: number, toCol: number, stop: boolean) => void
  removeSegment: (startCol: number) => void
  continueAgent: (seg: AgentSegment, col: number) => void
}

export function AgentLane({
  label,
  labelWidth,
  rowLabelClass,
  rowCols,
  colStart,
  colEnd,
  colW,
  nowCol,
  sel,
  setSel,
  discConfirmId,
  setDiscConfirmId,
  agents,
  segmentAt,
  agentStyle,
  displayAgentName,
  drag,
  onCellDragOver,
  onCellDrop,
  onGripDragStart,
  onDragEnd,
  openPickerForSeg,
  openPickerEmpty,
  resumeSegment,
  extendSegment,
  removeSegment,
  continueAgent,
}: AgentLaneProps) {
  const copy = useIntraopUiCopy()
  const { extendingAgent, extendHoverCol } = drag

  return (
    <div
      className="flex items-stretch border-b border-slate-200 dark:border-[#2e2e2e] bg-slate-50/60 dark:bg-[#1a1a1a]/60 relative"
      style={{ minHeight: 32 }}
    >
      <div style={{ width: labelWidth, minWidth: labelWidth }} className={rowLabelClass + " flex items-center justify-end py-2"}>
        {label}
      </div>
      {rowCols.map(ci => {
        const committedSeg = segmentAt(ci)
        // While a grip is being dragged the bar is drawn to the hover column,
        // so the extension is visible before it is committed.
        const draggingSeg = (() => {
          if (extendingAgent === null || extendHoverCol === null) return null
          const s = agents.find(a => a.startCol === extendingAgent)
          if (!s) return null
          return (ci > s.endCol && ci <= extendHoverCol) ? s : null
        })()
        const seg = committedSeg ?? draggingSeg
        const isDragPreview = !committedSeg && !!draggingSeg
        const style2 = seg ? (agentStyle[seg.name] ?? agentStyle["Sevoflurane"]) : null
        const isStart = seg?.startCol === ci
        const effectiveEnd = seg && extendingAgent === seg.startCol && extendHoverCol !== null ? extendHoverCol : (seg?.endCol ?? -1)
        const isEnd = seg !== null && ci === effectiveEnd
        const isRowCont = !isStart && seg != null && ci === colStart && barEntersRow(seg.startCol, colStart)
        const isRowExit = seg != null && barContinues(seg.endCol, colEnd) && ci === colEnd - 1
        const visStart = Math.max(seg?.startCol ?? 0, colStart)
        const visEnd = Math.min(effectiveEnd, colEnd - 1)

        return (
          <div
            key={ci}
            style={{ width: colW, minWidth: colW }}
            data-agent-cell
            className="group relative border-l border-slate-100 dark:border-[#2a2a2a] flex items-center"
            onDragOver={e => onCellDragOver(e, ci)}
            onDrop={e => onCellDrop(e, ci)}
            onClick={e => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              if (seg && isStart) openPickerForSeg(ci, seg, rect)
              else if (!seg) openPickerEmpty(ci, rect)
            }}
          >
            {!seg && (
              <span className="w-full text-center text-[10px] text-slate-300 dark:text-[#444] select-none pointer-events-none">
                {copy.gas.choose}
              </span>
            )}
            {seg && style2 && (() => {
              const isAgentSel = sel?.type === "agent" && sel.startCol === seg.startCol
              const agentLabel = (isStart || isRowCont)
                ? [displayAgentName(seg.name), seg.n2o != null ? `+ N2O ${seg.n2o}%` : null].filter(Boolean).join(" ")
                : null
              return (
                <>
                  <div
                    onClick={e => {
                      e.stopPropagation()
                      const rect = (e.currentTarget as HTMLElement).closest("[data-agent-cell]")?.getBoundingClientRect()
                        ?? (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setSel({ type: "agent", startCol: seg.startCol })
                      if (isStart) openPickerForSeg(ci, seg, rect)
                    }}
                    onDoubleClick={e => { e.stopPropagation(); if (seg.stopped) resumeSegment(seg.startCol) }}
                    title={seg.stopped ? copy.doubleClickResume : undefined}
                    className={`absolute inset-y-1 border-y cursor-pointer transition-all ${style2.bar} ${barLeftClass(isStart || isRowCont)} ${barRightClass(seg.endCol, isEnd, colEnd)} ${isDragPreview ? "opacity-60" : ""} ${isAgentSel ? "brightness-125 ring-1 ring-inset ring-white/40" : ""} ${seg.stopped ? "opacity-60 border-dashed" : ""}`}
                  />
                  {agentLabel && (
                    <span
                      className={`absolute top-1/2 -translate-y-1/2 z-10 pointer-events-none select-none text-xs font-bold whitespace-nowrap flex items-center justify-center ${style2.text}`}
                      style={{ left: 0, width: (visEnd - visStart + 1) * colW }}
                    >
                      {agentLabel}
                    </span>
                  )}
                </>
              )
            })()}
            {showBarGrip(seg?.endCol ?? -1, isEnd, isDragPreview, colEnd) && style2 && seg && !seg.stopped && (
              <div
                draggable
                onDragStart={e => { e.stopPropagation(); onGripDragStart(e, seg.startCol) }}
                onDragEnd={onDragEnd}
                className={`absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 ${style2.grip} opacity-70 hover:opacity-100 rounded-r-sm`}
              >
                <span className="text-white text-[8px] font-bold select-none">|</span>
              </div>
            )}
            {isEnd && !isRowExit && sel?.type === "agent" && sel.startCol === seg?.startCol && seg && !seg.stopped && !isDragPreview && (
              <DiscontinuePrompt
                open={discConfirmId === `agent-${seg.startCol}`}
                onOpen={() => setDiscConfirmId(`agent-${seg.startCol}`)}
                onConfirm={() => { extendSegment(seg.startCol, nowCol ?? seg.endCol, true); setSel(null); setDiscConfirmId(null) }}
                onCancel={() => setDiscConfirmId(null)}
                style={{ top: 2, right: 14 }}
              />
            )}
            {isStart && seg && (
              <button
                type="button"
                aria-label={copy.removeAria(displayAgentName(seg.name))}
                onClick={e => { e.stopPropagation(); removeSegment(seg.startCol) }}
                className="absolute top-0.5 right-3 z-10 opacity-0 hover:opacity-100 [@media(hover:none)]:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
            {!seg && !isDragPreview && (() => {
              // An agent turned off earlier can be picked up again here rather
              // than started afresh, which would read as a second agent.
              const stoppedAgent = agents.find(a => a.stopped && a.endCol < ci)
              return stoppedAgent ? (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); continueAgent(stoppedAgent, ci) }}
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
                >
                  <span className="text-[9px] font-bold text-emerald-500 dark:text-emerald-400 bg-white/80 dark:bg-black/40 px-1.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700 whitespace-nowrap">
                    {copy.fluid.continueQuestion}
                  </span>
                </button>
              ) : null
            })()}
          </div>
        )
      })}
    </div>
  )
}

export type GasSettingsLaneProps = LaneChrome & {
  locale: string
  gasSegmentAt: (col: number) => GasSettingsSegment | null
  openPickerForSeg: (col: number, seg: GasSettingsSegment, rect: DOMRect) => void
  openPickerEmpty: (col: number, rect: DOMRect) => void
  stopGas: (id: string, col: number | null) => void
}

export function GasSettingsLane({
  labelWidth,
  rowLabelClass,
  rowCols,
  colStart,
  colEnd,
  colW,
  nowCol,
  discConfirmId,
  setDiscConfirmId,
  locale,
  gasSegmentAt,
  openPickerForSeg,
  openPickerEmpty,
  stopGas,
}: GasSettingsLaneProps) {
  const copy = useIntraopUiCopy()
  return (
    <div
      className="flex items-stretch border-b border-slate-200 dark:border-[#2e2e2e] bg-slate-50/40 dark:bg-[#1a1a1a]/40 relative"
      style={{ minHeight: 32 }}
    >
      <div style={{ width: labelWidth, minWidth: labelWidth }} className={rowLabelClass + " flex items-center justify-end py-2"}>
        {copy.gas.settings}
      </div>
      {rowCols.map(ci => {
        const seg = gasSegmentAt(ci)
        const isStart = seg?.startCol === ci
        const isEnd = seg !== null && ci === seg.endCol
        const isRowCont = !isStart && seg != null && ci === colStart && seg.startCol < colStart
        const isRowExit = seg != null && barContinues(seg.endCol, colEnd) && ci === colEnd - 1 && !isEnd
        const settings = seg ? gasSettingsAtColumn(seg, ci) : null
        const isChange = settings?.changeCol === ci
        // The numbers are repeated wherever they change, so a long segment does
        // not leave the reader scrolling back to find what is running.
        const showSettingsLabel = Boolean(settings && (isStart || isRowCont || isChange))

        return (
          <div
            key={ci}
            style={{ width: colW, minWidth: colW }}
            className="group relative border-l border-slate-100 dark:border-[#2a2a2a] flex items-center cursor-pointer"
            onClick={e => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              if (seg) openPickerForSeg(ci, seg, rect)
              else openPickerEmpty(ci, rect)
            }}
          >
            {!seg && (
              <span className="w-full text-center text-[10px] text-slate-300 dark:text-[#444] select-none pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                {copy.gas.tapToStart}
              </span>
            )}
            {seg && (
              <div
                className={`absolute inset-y-1 border-y bg-indigo-200/50 dark:bg-indigo-500/20 border-indigo-400 dark:border-indigo-500 ${barLeftClass(isStart || isRowCont)} ${barRightClass(seg.endCol, isEnd && !isRowExit, colEnd)} ${seg.stopped ? "opacity-50 border-dashed" : ""}`}
              />
            )}
            {showSettingsLabel && settings && (
              <span
                title={displayGasSettings(settings, locale)}
                className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none select-none flex flex-col items-center justify-center text-[9px] font-bold leading-tight whitespace-nowrap text-indigo-700 dark:text-indigo-300 overflow-hidden px-0.5"
              >
                <span>FGF {settings.fgf} L/min</span>
                <span className="text-[8px]">{displayGasMix(settings, locale)}</span>
              </span>
            )}
            {isEnd && seg && !seg.stopped && (
              <DiscontinuePrompt
                open={discConfirmId === `gas-${seg.startCol}`}
                onOpen={() => setDiscConfirmId(`gas-${seg.startCol}`)}
                onConfirm={() => { stopGas(seg.id, nowCol); setDiscConfirmId(null) }}
                onCancel={() => setDiscConfirmId(null)}
                style={{ top: 2, right: 2 }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
