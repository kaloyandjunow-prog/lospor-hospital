"use client"

import { ChevronDown, ChevronRight, Plus } from "lucide-react"
import { abnormalSummary, type LabResult } from "@lospor/core/labs"

/**
 * Laboratory draws on the timetable.
 *
 * Collapsed to a single arrow by default, because most cases have no
 * intraoperative labs and a permanently open lane would cost every case the
 * vertical space that the vitals and drugs actually need.
 *
 * Expanded, it offers a `+` per column exactly like the medication lane, so
 * entering a draw is the same gesture as entering a drug.
 *
 * The summary is at most three results from the newest draw: whatever is out of
 * range, worst first, and when nothing is out of range the first few anyway. An
 * empty row would be ambiguous — it reads the same whether the panel was normal
 * or whether nobody has looked — and "Na 140, K 4.2" says plainly that somebody
 * drew bloods and they were fine.
 *
 * The cap is the design rather than a detail. Fifteen results rendered inline in
 * a timetable is a wall, not information, and at 2am what a clinician needs off
 * a glance is that the potassium is 2.1. Each chip opens the draw it came from;
 * everything else is one click further.
 */

type Draw = { colIdx: number; takenAt: string; results: LabResult[] }

export type TimetableLabsLaneProps = {
  label: string
  labelWidth: number
  rowLabelClass: string
  rowCols: number[]
  colW: number
  /** Every intraoperative result on the case, across all draws. */
  results: LabResult[]
  /** Which column each draw belongs in, derived by the host from its clock. */
  draws: Draw[]
  expanded: boolean
  onToggleExpanded: () => void
  /** Open the draw at this column — new, or the existing one. */
  onOpenDraw: (col: number) => void
  /** Open the full list of everything recorded. */
  onOpenAll: () => void
  /** Open the draw a summarised result came from, at its own time cell. */
  onOpenDrawAt?: (takenAt: string) => void
  labels: { expand: string; more: string; viewAll: string }
}

const SEVERITY_STYLE = {
  // Critical is visually distinct rather than merely darker: it is the one that
  // should stop somebody, and a difference of shade is not a difference a tired
  // reader reliably notices.
  critical: { bg: "#dc262622", fg: "#dc2626", border: "#dc262688", weight: "font-black" },
  high: { bg: "#f59e0b1a", fg: "#b45309", border: "#f59e0b55", weight: "font-bold" },
  low: { bg: "#3b82f61a", fg: "#1d4ed8", border: "#3b82f655", weight: "font-bold" },
  // A normal result is shown when nothing is abnormal, so the row still says a
  // draw happened. Deliberately quiet: it is context, not a finding.
  normal: { bg: "transparent", fg: "#64748b", border: "#cbd5e133", weight: "font-medium" },
} as const

export function TimetableLabsLane({
  label,
  labelWidth,
  rowLabelClass,
  rowCols,
  colW,
  results,
  draws,
  expanded,
  onToggleExpanded,
  onOpenDraw,
  onOpenAll,
  onOpenDrawAt,
  labels,
}: TimetableLabsLaneProps) {
  const { shown, hiddenCount } = abnormalSummary(results)
  const hasResults = results.length > 0

  return (
    <div className="border-b border-slate-100 dark:border-[#2a2a2a] bg-slate-50/20 dark:bg-[#181818]/40">
      {/* The collapsed header is always present: it is the arrow, and it is how
          a case with no labs gets its first one. */}
      <div className="flex items-stretch" style={{ minHeight: 26 }}>
        <div
          style={{ width: labelWidth, minWidth: labelWidth }}
          className={rowLabelClass + " flex items-center justify-end gap-1 py-1 cursor-pointer select-none hover:text-slate-600 dark:hover:text-slate-300 transition-colors"}
          onClick={onToggleExpanded}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-label={labels.expand}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleExpanded() } }}
        >
          {expanded
            ? <ChevronDown className="h-3 w-3 shrink-0" />
            : <ChevronRight className="h-3 w-3 shrink-0" />}
          <span>{label}</span>
        </div>

        {/* Collapsed, the abnormal summary still shows: the row exists to be
            read without opening anything, and a case with a critical potassium
            should not hide it behind a click. */}
        {!expanded && (
          <div
            className="flex-1 flex items-center gap-1 px-2 py-0.5 min-w-0 cursor-pointer"
            onClick={hasResults ? onOpenAll : onToggleExpanded}
          >
            {shown.map(item => {
              const style = SEVERITY_STYLE[item.severity]
              return (
                <span
                  key={`${item.result.test}-${item.result.takenAt ?? ""}`}
                  title={`${item.result.test} ${item.result.value} ${item.result.unit}`}
                  className={`text-[9px] ${style.weight} rounded px-1 py-px whitespace-nowrap`}
                  style={{ backgroundColor: style.bg, color: style.fg, border: `1px solid ${style.border}` }}
                >
                  {item.result.test} {item.result.value}
                </span>
              )
            })}
            {hiddenCount > 0 && (
              <span className="text-[9px] text-slate-500 dark:text-[#888] font-semibold whitespace-nowrap">
                +{hiddenCount} {labels.more}
              </span>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="flex items-stretch" style={{ minHeight: 30 }}>
          <div style={{ width: labelWidth, minWidth: labelWidth }} className={rowLabelClass + " flex items-center justify-end py-1"} />
          {rowCols.map(ci => {
            const colDraws = draws.filter(draw => draw.colIdx === ci)
            return (
              <div
                key={ci}
                style={{ width: colW, minWidth: colW }}
                className="group border-l border-slate-100 dark:border-[#2a2a2a] relative flex flex-col items-center justify-center py-0.5 px-0.5 cursor-pointer hover:bg-teal-50/40 dark:hover:bg-teal-900/10 transition-colors"
                onClick={() => onOpenDraw(ci)}
              >
                {colDraws.length === 0 ? (
                  <Plus className="h-2.5 w-2.5 opacity-0 group-hover:opacity-30 transition-opacity text-slate-400 dark:text-[#666]" />
                ) : (
                  <span
                    className="text-[8px] font-bold rounded-full px-1 py-px w-full text-center truncate"
                    style={{ backgroundColor: "#14b8a622", color: "#0d9488", border: "1px solid #14b8a655" }}
                  >
                    {colDraws.reduce((total, draw) => total + draw.results.length, 0)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Expanded and populated: the same summary, plus the way to everything
          else. Kept below the columns so the abnormal values read as belonging
          to the case rather than to any one time slot. */}
      {expanded && hasResults && (
        <div className="flex items-center gap-1 flex-wrap px-2 py-1 border-t border-slate-100 dark:border-[#2a2a2a]">
          {shown.map(item => {
            const style = SEVERITY_STYLE[item.severity]
            return (
              <button
                key={`${item.result.test}-${item.result.takenAt ?? ""}`}
                type="button"
                // Opens the draw this result came from, at its own time cell,
                // rather than the whole list: the question a clinician has
                // after reading "K 2.1" is what else was on that gas.
                onClick={() => {
                  const takenAt = item.result.takenAt
                  if (takenAt && onOpenDrawAt) onOpenDrawAt(takenAt)
                  else onOpenAll()
                }}
                className={`text-[9px] ${style.weight} rounded px-1.5 py-0.5 cursor-pointer hover:opacity-75 transition-opacity`}
                style={{ backgroundColor: style.bg, color: style.fg, border: `1px solid ${style.border}` }}
              >
                {item.result.test} {item.result.value} {item.result.unit}
              </button>
            )
          })}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={onOpenAll}
              className="text-[9px] font-semibold text-slate-500 dark:text-[#888] hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
            >
              +{hiddenCount} {labels.more}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenAll}
            className="text-[9px] font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer ml-auto"
          >
            {labels.viewAll}
          </button>
        </div>
      )}
    </div>
  )
}
