"use client"

/**
 * The row of clock times, and the chart's sense of "when".
 *
 * Tapping a time selects that column, which is what the keyboard shortcuts and
 * the quick-entry actions then act on. Columns past the end of the case are not
 * selectable — once a case is finished, nothing can be recorded after it, and a
 * dead-looking column is a clearer statement of that than a click that silently
 * does nothing.
 *
 * The pulsing dot marks the current five minutes, and only while the case is
 * still running. It is the one thing on the chart that moves on its own, which
 * is the point: it is how a glance answers "where am I now".
 */

export type TimetableTimeHeaderProps = {
  label: string
  labelWidth: number
  /** Absolute column indices this chart row covers. */
  rowCols: number[]
  colW: number
  /** Wall-clock label per column, indexed absolutely. */
  times: string[]
  selectedCol: number
  onSelectCol: (col: number) => void
  /** Last column of the case, or null while it is still running. */
  endCol: number | null
  /** Column holding the current time, or null when the case has ended. */
  nowCol: number | null
  /** The now-marker belongs to one chart row only. */
  isActiveRow: boolean
  caseEnded: boolean
}

export function TimetableTimeHeader({
  label,
  labelWidth,
  rowCols,
  colW,
  times,
  selectedCol,
  onSelectCol,
  endCol,
  nowCol,
  isActiveRow,
  caseEnded,
}: TimetableTimeHeaderProps) {
  return (
    <div className="flex border-b border-slate-100 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#1a1a1a]">
      <div
        style={{ width: labelWidth, minWidth: labelWidth }}
        className="text-[10px] text-slate-300 dark:text-[#555] px-2 py-1.5 text-right"
      >
        {label}
      </div>
      {rowCols.map(ci => {
        const isPostEnd = endCol !== null && ci > endCol
        return (
          <div
            key={ci}
            style={{ width: colW, minWidth: colW }}
            onClick={() => { if (!isPostEnd) onSelectCol(ci) }}
            className={`relative text-xs font-mono font-semibold text-center py-2 border-l border-slate-100 dark:border-[#2a2a2a] transition-colors select-none ${
              isPostEnd
                ? "text-slate-300 dark:text-[#444] bg-slate-50 dark:bg-[#111] cursor-default"
                : selectedCol === ci
                  ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 cursor-pointer"
                  : "text-slate-500 dark:text-[#888] hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer"
            }`}
          >
            {times[ci]}
            {isActiveRow && nowCol === ci && !caseEnded && (
              <span className="absolute top-0.5 right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
              </span>
            )}
            {!isPostEnd && selectedCol === ci && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400" />
            )}
          </div>
        )
      })}
    </div>
  )
}
