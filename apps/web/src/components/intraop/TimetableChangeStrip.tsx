"use client"

/**
 * The strip above a bar that says what it ran at, stretch by stretch: a
 * rate-mode fluid's mL/h and an agent's percent (10.0.0), as infusions already
 * show their rate. Before, those bars carried one label with the latest value,
 * so 2% then 1.5% then 1% read as a bar at 1%.
 *
 * It shares the bar's left/right geometry so the two read as one object, stays
 * on a stopped bar (faded), and is drawn wherever the bar is drawn while it is
 * dragged, so it travels with it. A change still ahead of now is not a stretch:
 * it is a planned marker until its time comes.
 */

export type StripStretch = { col: number; label: string }

/** The applied stretches of a bar, the start's own value first. */
export function stripStretches(
  startCol: number,
  startLabel: string | null,
  changes: readonly { col: number; label: string; planned?: boolean }[],
): StripStretch[] {
  const applied = changes.filter(change => !change.planned && change.col > startCol).sort((a, b) => a.col - b.col)
  return [...(startLabel ? [{ col: startCol, label: startLabel }] : []), ...applied.map(({ col, label }) => ({ col, label }))]
}

/** The value in force at a column, or null before the first stretch. */
export function stretchAt(stretches: readonly StripStretch[], col: number): StripStretch | null {
  return stretches.filter(stretch => stretch.col <= col).pop() ?? null
}

export function ChangeStripCell({
  col, stretches, color, tone, height, top = 0, roundStart, roundEnd, faded, selected, timed, onClick, testId,
}: {
  col: number
  stretches: readonly StripStretch[]
  /** The bar colour as a hex; or `tone`, the bar's own classes, where it is drawn by class (agents). */
  color?: string
  tone?: { bg: string; text: string }
  height: number
  top?: number
  /** The bar starts (or enters the row) in this cell. */
  roundStart: boolean
  /** The bar ends in this cell. */
  roundEnd: boolean
  faded?: boolean
  selected?: boolean
  /** The real start and stop inside the cell, as the bar below uses them. */
  timed?: { left?: number; right?: number }
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void
  testId?: string
}) {
  const current = stretchAt(stretches, col)
  if (!current) return null
  const isChange = stretches.some((stretch, index) => index > 0 && stretch.col === col)
  const showLabel = stretches.some(stretch => stretch.col === col) || roundStart
  return (
    <div
      data-testid={testId}
      className={`absolute z-20 flex items-center overflow-hidden select-none ${onClick ? "cursor-pointer hover:opacity-90" : "pointer-events-none"} ${faded ? "opacity-50" : ""} ${roundStart ? "left-1 rounded-tl-full" : "left-0"} ${roundEnd ? "right-3 rounded-tr-sm" : "right-0"}`}
      style={{ top, height, ...(color ? { backgroundColor: color + (selected ? "50" : "2e") } : {}), ...timed }}
      onClick={onClick ? event => { event.stopPropagation(); onClick(event) } : undefined}
    >
      {tone && <div className={`absolute inset-0 ${tone.bg} ${selected ? "opacity-40" : "opacity-25"}`} />}
      {isChange && <div className={`absolute left-0 top-1 bottom-1 w-[2px] rounded-full opacity-70 ${tone?.bg ?? ""}`} style={color ? { backgroundColor: color } : undefined} />}
      {showLabel && (
        <span className={`relative text-[8px] font-bold whitespace-nowrap truncate leading-none ${tone?.text ?? ""}`} style={{ ...(color ? { color } : {}), paddingLeft: isChange ? 6 : 5 }}>
          {current.label}
        </span>
      )}
    </div>
  )
}
