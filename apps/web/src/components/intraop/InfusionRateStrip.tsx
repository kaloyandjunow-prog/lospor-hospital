"use client"

import { tciLaneLabel, TciCellLine, type TciLanePrediction } from "./TciLaneOverlay"
import type { TimetableDragActions } from "./use-timetable-drag"
import type { TimetableInfusion } from "@/types/timetable"
import { readableTextColor } from "@lospor/core/drug-colors"
import type { InfusionMenuRequest } from "./TimetableInfusionLane"

export function InfusionRateStrip({ seg, ci, color, isActualStart, isRowCont, isActualEnd, isRowExit, isSelected: _isSelected, cutOff, timedLeft, timedRight, dragActions, onOpenMenu, prediction }: {
  seg: TimetableInfusion
  ci: number
  color: string
  isActualStart: boolean
  isRowCont: boolean
  isActualEnd: boolean
  isRowExit: boolean
  isSelected: boolean
  cutOff: boolean
  timedLeft: { left?: number }
  timedRight: { right?: number }
  dragActions: TimetableDragActions
  onOpenMenu: (request: InfusionMenuRequest) => void
  prediction: TciLanePrediction | undefined
}) {
  const sortedChanges = (seg.rateChanges ?? []).filter(rc => !rc.planned).sort((a, b) => a.col - b.col)
  const prevChange = sortedChanges.filter(rc => rc.col <= ci).pop()
  const curRate = prevChange?.rate ?? seg.rate
  const curUnit = prevChange?.unit ?? seg.unit
  const isSegStart = ci === seg.startCol || sortedChanges.some(rc => rc.col === ci)
  const isRateChangeCol = sortedChanges.some(rc => rc.col === ci)
  const label = tciLaneLabel(seg, curRate, curUnit, ci === seg.startCol) ?? `${curRate} ${curUnit}`
  const leftStyle = (isActualStart || isRowCont) ? "left-1" : "left-0"
  const rightStyle = (isActualEnd && !isRowExit) ? "right-3" : "right-0"
  const tlRadius = (isActualStart || isRowCont) ? "rounded-tl-full" : ""
  const trRadius = (isActualEnd && !isRowExit) ? "rounded-tr-sm" : ""
  return <div className={`absolute top-[7px] bottom-[5px] z-20 flex items-center cursor-pointer select-none hover:opacity-90 transition-opacity overflow-hidden ${cutOff ? "opacity-30" : seg.stopped ? "opacity-50" : ""} ${leftStyle} ${rightStyle} ${tlRadius} ${trRadius}`} style={{ ...timedLeft, ...timedRight }} onClick={event => { event.stopPropagation(); onOpenMenu({ segId: seg.id, name: seg.name, color, rect: event.currentTarget.getBoundingClientRect(), stopped: !!seg.stopped, fromPillCol: ci }) }}>
    {isRateChangeCol && !seg.stopped && <div draggable className="absolute left-0 top-1 bottom-1 w-[2px] cursor-col-resize z-30 rounded-full pointer-coarse:before:absolute pointer-coarse:before:inset-y-0 pointer-coarse:before:-inset-x-2 pointer-coarse:before:content-[''] opacity-70 hover:opacity-100" style={{ backgroundColor: "rgba(255,255,255,.9)" }} onDragStart={event => { event.stopPropagation(); const change = sortedChanges.find(item => item.col === ci)!; dragActions.ratePillStart({ infId: seg.id, fromCol: ci, rate: Number(change.rate) || 0, unit: change.unit, concentration: change.concentration, volumeRateMlPerHour: change.volumeRateMlPerHour }) }} onDragEnd={() => dragActions.ratePillEnd()} onClick={event => event.stopPropagation()} />}
    {isSegStart && <span data-tt-full={`${seg.name} · ${label}`} data-tt-owner={`infusion:${seg.id}`} className={`${seg.stopped ? "" : "tt-onbar"} text-xs font-bold whitespace-nowrap truncate leading-none`} style={{ color, ["--tt-on" as string]: readableTextColor(color), paddingLeft: isRateChangeCol ? 10 : 11 }}>{label}</span>}
    <TciCellLine seg={seg} column={ci} prediction={prediction} color={color} />
  </div>
}
