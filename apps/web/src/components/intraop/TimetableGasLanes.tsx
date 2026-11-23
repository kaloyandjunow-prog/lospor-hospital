"use client"

import { PlannedChangeMarker, PlannedStopMarker } from "./PlannedStopMarker"
import { SaveMark } from "./SaveMark"
import { TOUCH_GRIP } from "./touch-drag"
import { segmentEventIds } from "@lospor/core/intraop-save-state"
import { displayGasMix, displayGasSettings } from "@/lib/clinical-display"
import { useTimetableMenu } from "./TimetableMenuHost"
import { barContinues, barEntersRow, barLeftClass, barRightClass, showBarGrip } from "./timetable-row-geometry"
import type { TimetableDragState } from "./use-timetable-drag"
import type { TtSel } from "./timetable-types"
import type { AgentSegment, GasSettingsSegment } from "@/types/timetable"
import { gasSettingsAtColumn } from "@lospor/core/intraop-summary"
import { useIntraopUiCopy } from "./ui-copy"
import { ChangeStripCell, stretchAt, stripStretches } from "./TimetableChangeStrip"
import { ttCell, ttLane } from "./chart-cursor"
import { CellHint } from "./CellHint"
import { LaneTotal, laneDuration, totalColumn } from "./lane-extras"

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
  /** `atCol` is the column clicked: the editor changes the percent from there. */
  openPickerForSeg: (col: number, seg: AgentSegment, rect: DOMRect, atCol?: number) => void
  openPickerEmpty: (col: number, rect: DOMRect) => void
  resumeSegment: (startCol: number) => void
  extendSegment: (startCol: number, toCol: number) => void
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
  sel,
  setSel,
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
}: AgentLaneProps) {
  const copy = useIntraopUiCopy()
  const menu = useTimetableMenu()
  const { extendingAgent, extendHoverCol } = drag
  // 10.8.0: a cell of a running or stopped agent opens its menu (Stop, Change dose, Resume, ...).
  const openAgentMenu = (name: string, ci: number, rect: DOMRect) =>
    !!menu?.openContinuous({ kind: "agent", key: name, col: ci, rect, title: displayAgentName(name) })
  // 10.8.0: the concentration is written inside the bar (start and each change), not in a strip above it.
  const stretchesOf = (seg: AgentLaneProps["agents"][number]) => stripStretches(seg.startCol,
    seg.percent != null ? [`${seg.percent}%`, seg.n2o != null ? `N2O ${seg.n2o}%` : null].filter(Boolean).join(" + ") : null,
    (seg.percentChanges ?? []).map(change => ({ col: change.col, label: `${change.percent}%`, planned: change.planned })))
  const nowCol = menu?.facts.nowCol ?? null
  const running = nowCol == null ? null : agents.find(agent => !agent.stopped && !agent.planned && agent.startCol <= nowCol) ?? null
  const currentDose = running && nowCol != null ? stretchAt(stretchesOf(running), nowCol)?.label ?? null : null

  return (
    <div
      {...ttLane(`agent:${label}`)}
      className="flex items-stretch border-b border-slate-200 dark:border-[#2e2e2e] bg-slate-50/60 dark:bg-[#1a1a1a]/60 relative"
      style={{ minHeight: 40 }}
    >
      <div data-tt-label style={{ width: labelWidth, minWidth: labelWidth }} className={rowLabelClass + " flex flex-col items-end justify-center py-1"}>
        <span>{label}</span>
        {currentDose ? <span data-testid="agent-current-dose" className="text-xs font-bold normal-case tracking-normal">{currentDose}</span> : null}
      </div>
      {rowCols.map(ci => {
        const dragged = extendingAgent !== null && extendHoverCol !== null
          ? agents.find(a => a.startCol === extendingAgent) ?? null
          : null
        const wholeSeg = segmentAt(ci)
        // Dragged back, the bar is drawn only as far as the hover column; the
        // columns it would give up stay empty instead of drawing as loose boxes.
        const vacated = !!(dragged && wholeSeg && wholeSeg.startCol === dragged.startCol && ci > (extendHoverCol as number))
        const committedSeg = vacated ? null : wholeSeg
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

        return (
          <div
            key={ci}
            style={{ width: colW, minWidth: colW }}
            data-agent-cell
            {...ttCell(ci, seg ? { kind: "agent", key: seg.name, col: ci } : null)}
            className="group relative border-l border-slate-100 dark:border-[#2a2a2a] flex items-center"
            onDragOver={e => onCellDragOver(e, ci)}
            onDrop={e => onCellDrop(e, ci)}
            onClick={e => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              const stopped = agents.find(a => a.stopped && a.endCol < ci)
              if (seg && openAgentMenu(seg.name, ci, rect)) return
              if (!seg && stopped && openAgentMenu(stopped.name, ci, rect)) return
              if (seg) openPickerForSeg(seg.startCol, seg, rect, ci)
              else if (!vacated) openPickerEmpty(ci, rect)
            }}
          >
            {!seg && !vacated && (
              <CellHint text={copy.gas.choose} show={!agents.some(a => !a.stopped && !a.planned) && ci === nowCol}
                className="w-full text-center text-xs text-slate-300 dark:text-[#444] select-none pointer-events-none" />
            )}
            {seg && style2 && (() => {
              const isAgentSel = sel?.type === "agent" && sel.startCol === seg.startCol
              const stretches = stretchesOf(seg)
              return (
                <>
                  <div
                    onClick={e => {
                      e.stopPropagation()
                      const rect = (e.currentTarget as HTMLElement).closest("[data-agent-cell]")?.getBoundingClientRect()
                        ?? (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setSel({ type: "agent", startCol: seg.startCol })
                      if (!openAgentMenu(seg.name, ci, rect)) openPickerForSeg(seg.startCol, seg, rect, ci)
                    }}
                    className={`tt-bar tt-glass ${isEnd && !isRowExit && !seg.planned ? (seg.stopped ? "tt-end tt-stopnotch" : "tt-end tt-live") : ""} absolute inset-y-1 border-y border-transparent cursor-pointer transition-all ${style2.bar} ${barLeftClass(isStart || isRowCont)} ${barRightClass(seg.endCol, isEnd, colEnd)} ${isDragPreview ? "opacity-60" : ""} ${isAgentSel ? "brightness-125 ring-1 ring-inset ring-white/40" : ""} ${seg.planned ? "opacity-40 border-dashed" : seg.stopped ? "opacity-60 border-dashed" : ""}`}
                  />
                  {isEnd && <SaveMark eventIds={segmentEventIds(seg)} className="absolute top-0 right-0" />}
                  {stretches.length > 0 && (
                    <ChangeStripCell
                      col={ci}
                      stretches={stretches}
                      tone={{ bg: style2.bar, text: style2.text }}
                      height={30}
                      top={5}
                      inline
                      roundStart={isStart || isRowCont}
                      roundEnd={isEnd && !isRowExit}
                      faded={!!seg.stopped || !!seg.planned || isDragPreview}
                      selected={sel?.type === "agent" && sel.startCol === seg.startCol}
                      onClick={event => {
                        const rect = (event.currentTarget as HTMLElement).closest("[data-agent-cell]")?.getBoundingClientRect()
                          ?? event.currentTarget.getBoundingClientRect()
                        setSel({ type: "agent", startCol: seg.startCol })
                        if (!openAgentMenu(seg.name, ci, rect)) openPickerForSeg(seg.startCol, seg, rect, ci)
                      }}
                      testId="agent-percent-strip" owner={`agent:${seg.name}`} fullPrefix={displayAgentName(seg.name)}
                    />
                  )}
                </>
              )
            })()}
            {showBarGrip(seg?.endCol ?? -1, isEnd, isDragPreview, colEnd) && style2 && seg && (
              <div
                draggable
                onDragStart={e => { e.stopPropagation(); onGripDragStart(e, seg.startCol) }}
                onDragEnd={onDragEnd}
                className={`tt-grip absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 ${style2.grip} opacity-70 hover:opacity-100 rounded-r-sm ${TOUCH_GRIP}`}
              >
                <span className="text-white text-xs font-bold select-none">|</span>
              </div>
            )}
            {agents.filter(a => !a.planned && totalColumn(a, nowCol) === ci).map(a => <LaneTotal key={a.startCol} text={laneDuration(a.startCol, a.stopped ? a.endCol : Math.min(a.endCol, nowCol ?? a.endCol))} testId="agent-total" />)}
            {agents.some(a => a.plannedStopCol === ci) && <PlannedStopMarker />}
            {agents.flatMap(a => (a.percentChanges ?? []).filter(change => change.planned && change.col === ci))
              .map(change => <PlannedChangeMarker key={change.eventId ?? change.col} value={`${change.percent}%`} />)}
          </div>
        )
      })}
    </div>
  )
}

export type GasSettingsLaneProps = LaneChrome & {
  locale: string
  gasSegmentAt: (col: number) => GasSettingsSegment | null
  /** A setting change dated after now in this column (9.13.0). */
  plannedGasChangeAt?: (col: number) => { fgf: number; fio2: number } | null
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
  locale,
  gasSegmentAt,
  openPickerForSeg,
  openPickerEmpty,
  plannedGasChangeAt,
}: GasSettingsLaneProps) {
  const copy = useIntraopUiCopy()
  const menu = useTimetableMenu()
  const nowCol = menu?.facts.nowCol ?? null
  const nowSeg = nowCol != null ? gasSegmentAt(nowCol) : null
  const nowSettings = nowSeg && nowCol != null && !nowSeg.stopped ? gasSettingsAtColumn(nowSeg, nowCol) : null
  return (
    <div
      {...ttLane("gas")}
      className="flex items-stretch border-b border-slate-200 dark:border-[#2e2e2e] bg-slate-50/40 dark:bg-[#1a1a1a]/40 relative"
      style={{ minHeight: 40 }}
    >
      <div data-tt-label style={{ width: labelWidth, minWidth: labelWidth }} className={rowLabelClass + " flex flex-col items-end justify-center py-1"}>
        <span>{copy.gas.settings}</span>
        {nowSettings ? <span data-testid="gas-current" className="text-xs font-bold normal-case tracking-normal">FGF {nowSettings.fgf} · FiO₂ {nowSettings.fio2}%</span> : null}
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
            {...ttCell(ci, seg ? { kind: "gas", key: "gas", col: ci } : null)}
            className="group relative border-l border-slate-100 dark:border-[#2a2a2a] flex items-center cursor-pointer"
            onClick={e => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              // 10.8.0: the gas settings' menu in this cell (Stop, Change, Resume, ...).
              if (menu?.openContinuous({ kind: "gas", key: "gas", col: ci, rect, title: copy.gas.settings })) return
              if (seg) openPickerForSeg(ci, seg, rect)
              else openPickerEmpty(ci, rect)
            }}
          >
            {(() => {
              // The total: in the column after the end, or after now while it runs.
              const before = ci > 0 ? gasSegmentAt(ci - 1) : null
              return before && !seg && totalColumn(before, nowCol) === ci
                ? <LaneTotal text={laneDuration(before.startCol, before.stopped ? before.endCol : Math.min(before.endCol, nowCol ?? before.endCol))} testId="gas-total" />
                : null
            })()}
            {(() => { const planned = plannedGasChangeAt?.(ci); return planned ? <PlannedChangeMarker value={`FGF ${planned.fgf} · FiO₂ ${planned.fio2}%`} /> : null })()}
            {!seg && (
              <CellHint text={copy.gas.tapToStart} show={!(nowSeg && !nowSeg.stopped) && ci === nowCol}
                className="w-full text-center text-xs text-slate-400 dark:text-[#666] select-none pointer-events-none" />
            )}
            {seg && isEnd && <SaveMark eventIds={segmentEventIds(seg)} className="absolute top-0 right-0" />}
            {seg && (
              <div
                className={`tt-bar tt-glass ${isEnd && !isRowExit && !false ? (seg.stopped ? "tt-end tt-stopnotch" : "tt-end tt-live") : ""} absolute inset-y-1 border-y border-transparent bg-indigo-500 ${barLeftClass(isStart || isRowCont)} ${barRightClass(seg.endCol, isEnd && !isRowExit, colEnd)} ${seg.stopped ? "opacity-50 border-dashed" : ""}`}
              />
            )}
            {showSettingsLabel && settings && (
              <span
                title={displayGasSettings(settings, locale)}
                className={`absolute left-1 top-1/2 -translate-y-1/2 z-10 pointer-events-none select-none flex flex-col items-start justify-center text-xs font-bold leading-tight whitespace-nowrap ${seg?.stopped ? "text-indigo-800 dark:text-indigo-200" : "tt-onbar"}`}
              >
                <span>FGF {settings.fgf} L/min</span>
                <span className="text-xs">{displayGasMix(settings, locale)}</span>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
