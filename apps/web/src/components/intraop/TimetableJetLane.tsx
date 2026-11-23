"use client"

import { useTranslations } from "next-intl"
import type { JetSegment } from "@lospor/core/intraop-types"
import { barContinues, barLeftClass, barRightClass } from "./timetable-row-geometry"
import { jetSettingsAtColumn } from "./jet-lane"
import { useTimetableMenu } from "./TimetableMenuHost"
import { ttCell, ttLane } from "./chart-cursor"
import { CellHint } from "./CellHint"
import { LaneTotal, laneDuration, totalColumn } from "./lane-extras"

/**
 * The jet ventilation lane (10.2.0), shown once Jet is ticked among the
 * ventilation modes, or a run is on the chart. Drawn like the gas settings:
 * a bar from the start to the stop, the settings written wherever they change.
 */
export function TimetableJetLane({ labelWidth, rowLabelClass, rowCols, colStart, colEnd, colW, segmentAt, onOpen }: {
  labelWidth: number
  rowLabelClass: string
  rowCols: number[]
  colStart: number
  colEnd: number
  colW: number
  segmentAt: (col: number) => JetSegment | null
  onOpen: (col: number, seg: JetSegment | null, rect: DOMRect) => void
}) {
  const menu = useTimetableMenu()
  const t = useTranslations("intraop.jet")
  const jetNowCol = menu?.facts.nowCol ?? null
  const jetNow = jetNowCol == null ? null : segmentAt(jetNowCol)
  return (
    <div data-testid="jet-lane" {...ttLane("jet")} className="flex items-stretch border-b border-slate-200 dark:border-[#2e2e2e] bg-teal-50/30 dark:bg-[#132020]/40 relative" style={{ minHeight: 32 }}>
      <div data-tt-label style={{ width: labelWidth, minWidth: labelWidth }} className={rowLabelClass + " flex items-center justify-end py-2"}>
        {t("row")}
      </div>
      {rowCols.map(ci => {
        const seg = segmentAt(ci)
        const isStart = seg?.startCol === ci
        const isEnd = seg !== null && ci === seg.endCol
        const isRowCont = !isStart && seg != null && ci === colStart && seg.startCol < colStart
        const isRowExit = seg != null && barContinues(seg.endCol, colEnd) && ci === colEnd - 1 && !isEnd
        const settings = seg ? jetSettingsAtColumn(seg, ci) : null
        const showLabel = Boolean(settings && (isStart || isRowCont || settings.changeCol === ci))
        return (
          <div key={ci} data-testid={`jet-cell-${ci}`} style={{ width: colW, minWidth: colW }} {...ttCell(ci, seg ? { kind: "jet", key: "jet", col: ci } : null)}
            className="group relative border-l border-slate-100 dark:border-[#2a2a2a] flex items-center cursor-pointer"
            onClick={event => { const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(); if (!menu?.openContinuous({ kind: "jet", key: "jet", col: ci, rect, title: "Jet" })) onOpen(ci, seg, rect) }}>
            {!seg && (
              <CellHint text={t("tapToStart")} show={!(jetNow && !jetNow.stopped) && ci === (menu?.facts.nowCol ?? null)}
                className="w-full text-center text-xs text-slate-300 dark:text-[#444] select-none pointer-events-none" />
            )}
            {(() => {
              const before = ci > 0 ? segmentAt(ci - 1) : null
              const nowCol = menu?.facts.nowCol ?? null
              return before && !seg && totalColumn(before, nowCol) === ci
                ? <LaneTotal text={laneDuration(before.startCol, before.stopped ? before.endCol : Math.min(before.endCol, nowCol ?? before.endCol))} testId="jet-total" />
                : null
            })()}
            {seg && (
              <div className={`tt-bar tt-glass ${isEnd && !isRowExit && !false ? (seg.stopped ? "tt-end tt-stopnotch" : "tt-end tt-live") : ""} absolute inset-y-1 border-y border-transparent bg-teal-600 ${barLeftClass(isStart || isRowCont)} ${barRightClass(seg.endCol, isEnd && !isRowExit, colEnd)} ${seg.stopped ? "opacity-50 border-dashed" : ""}`} />
            )}
            {showLabel && settings && (
              <span className={`absolute left-1 top-1/2 -translate-y-1/2 z-10 pointer-events-none select-none flex flex-col items-start text-xs font-bold leading-tight whitespace-nowrap ${seg?.stopped ? "text-teal-800 dark:text-teal-200" : "tt-onbar"}`}>
                <span>{settings.pressureBar} bar · {settings.rate}/min</span>
                <span className="text-xs">FiO₂ {settings.fio2}%</span>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
