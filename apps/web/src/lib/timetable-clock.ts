import { secondsFromGridOrigin } from "@/lib/intraop-clock"

/**
 * Where the now-marker sits, and how wide the table has to be to hold it.
 *
 * Column arithmetic, pulled out of the live-clock effect in `IntraopTimetable`
 * because it is the part that can be wrong by a whole column without anything
 * looking broken — and the part worth a test. Nothing here touches state or the
 * DOM; the effect keeps every setter it had.
 *
 * Two things are load-bearing and were learned the hard way, so they are stated
 * rather than implied:
 *
 * The offset is measured from the grid origin — column zero's own start — not
 * from the case start time. Measuring from the case start put the marker up to
 * one interval to the left of the wall clock it was supposed to name.
 *
 * The width is sized from the *true* elapsed column, not the clamped one.
 * Clamping first made the grow check always true, so the table crept outward by
 * one column per tick instead of sizing to the clock in a single step.
 */
export type NowMarkerGeometry = {
  /** Null when the case has not begun: no marker, no growth, no auto-extend. */
  offsetPx: number | null
  /** The column the clock is actually in, unclamped. */
  trueCol: number
  /** The column to select — the true one, clamped into the table. */
  col: number
  /** Non-null when the table must grow to hold the clock. */
  requiredColCount: number | null
}

export function nowMarkerGeometry(input: {
  gridStartMs: number | null
  now: Date
  intervalMinutes: number
  columnWidthPx: number
  colCount: number
  layout: "scroll" | "expand"
  rowCols: number
}): NowMarkerGeometry {
  const diffSecs = secondsFromGridOrigin(input.gridStartMs, input.now)

  // A start time in the future is a case that has not begun.
  if (diffSecs === null || diffSecs < 0) {
    return { offsetPx: null, trueCol: 0, col: 0, requiredColCount: null }
  }

  const secondsPerColumn = input.intervalMinutes * 60
  const trueCol = Math.floor(diffSecs / secondsPerColumn)

  const requiredColCount = trueCol + 1 >= input.colCount
    ? (input.layout === "scroll"
        ? trueCol + 2
        : Math.ceil((trueCol + 2) / input.rowCols) * input.rowCols)
    : null

  const grownCount = requiredColCount ?? input.colCount
  const px = diffSecs / secondsPerColumn * input.columnWidthPx

  return {
    offsetPx: Math.min(px, grownCount * input.columnWidthPx),
    trueCol,
    col: Math.min(trueCol, grownCount - 1),
    requiredColCount,
  }
}
