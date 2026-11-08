"use client"

import { useTranslations } from "next-intl"
import type { JetSegment } from "@lospor/core/intraop-types"
import { barContinues, barLeftClass, barRightClass } from "./timetable-row-geometry"
import { jetSettingsAtColumn } from "./jet-lane"

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
  const t = useTranslations("intraop.jet")
  return (
    <div data-testid="jet-lane" className="flex items-stretch border-b border-slate-200 dark:border-[#2e2e2e] bg-teal-50/30 dark:bg-[#132020]/40 relative" style={{ minHeight: 32 }}>
      <div style={{ width: labelWidth, minWidth: labelWidth }} className={rowLabelClass + " flex items-center justify-end py-2"}>
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
          <div key={ci} data-testid={`jet-cell-${ci}`} style={{ width: colW, minWidth: colW }}
            className="group relative border-l border-slate-100 dark:border-[#2a2a2a] flex items-center cursor-pointer"
            onClick={event => onOpen(ci, seg, (event.currentTarget as HTMLElement).getBoundingClientRect())}>
            {!seg && (
              <span className="w-full text-center text-[10px] text-slate-300 dark:text-[#444] select-none pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                {t("tapToStart")}
              </span>
            )}
            {seg && (
              <div className={`absolute inset-y-1 border-y bg-teal-200/50 dark:bg-teal-500/20 border-teal-400 dark:border-teal-500 ${barLeftClass(isStart || isRowCont)} ${barRightClass(seg.endCol, isEnd && !isRowExit, colEnd)} ${seg.stopped ? "opacity-50 border-dashed" : ""}`} />
            )}
            {showLabel && settings && (
              <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none select-none flex flex-col items-center text-[9px] font-bold leading-tight whitespace-nowrap text-teal-700 dark:text-teal-300 overflow-hidden px-0.5">
                <span>{settings.pressureBar} bar · {settings.rate}/min</span>
                <span className="text-[8px]">FiO₂ {settings.fio2}%</span>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
