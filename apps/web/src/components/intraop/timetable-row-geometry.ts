/**
 * Where a chart row starts and ends, and where the two moving lines sit on it.
 *
 * This was computed inline at the top of the timetable's row renderer, which
 * meant the only way to check it was to look at the screen. Two of its outputs
 * are clinically read rather than decorative: the "now" marker tells an
 * anaesthetist which column they are documenting into, and the post-case overlay
 * marks where the record stops. An off-by-one in either puts an event against
 * the wrong five minutes on a document that goes in the patient's file.
 *
 * Pure, so it can be checked at the boundaries where those errors live.
 */

export type RowGeometryInput = {
  /** Zero-based index of the row within the chart. */
  rowIdx: number
  /** Columns per full row. */
  rowCols: number
  /** Total columns in the chart. */
  colCount: number
  /** Rendered width of a column, in pixels. */
  colW: number
  /** Width of the row's label gutter, in pixels. */
  labelW: number
  /** The column "now" falls in, or null when the chart is not live. */
  nowCol: number | null
  /** Offset of the now marker, in base-column units. */
  nowOffsetPx: number | null
  /** Base column width the offset is expressed in. */
  baseColW: number
  /** Last column of the case, or null while it is still running. */
  endCol: number | null
  /** Whether the case has ended; the live marker is hidden once it has. */
  caseEnded: boolean
  /** Printing and the summary render partial rows with explicit bounds. */
  overrideColStart?: number
  overrideColEnd?: number
}

export type RowGeometry = {
  colStart: number
  colEnd: number
  columns: number[]
  isActiveRow: boolean
  width: number
  /** Pixel offset of the live marker within this row, or null when it is elsewhere. */
  nowPx: number | null
  /**
   * Pixel offset where the post-case overlay begins.
   * `null` means the whole row is before the end; `0` means all of it is after.
   */
  endOverlayLeft: number | null
}

export function computeRowGeometry(input: RowGeometryInput): RowGeometry {
  const {
    rowIdx, rowCols, colCount, colW, labelW,
    nowCol, nowOffsetPx, baseColW, endCol, caseEnded,
    overrideColStart, overrideColEnd,
  } = input

  const colStart = overrideColStart ?? rowIdx * rowCols
  const colEnd = overrideColEnd ?? Math.min(colStart + rowCols, colCount)
  const columns = Array.from({ length: colEnd - colStart }, (_, i) => colStart + i)

  // An explicitly bounded row is the only row there is, so it is the active one
  // whenever the chart is live at all. Otherwise the active row is the one
  // holding "now", or — before the case starts — the last row, so a fresh chart
  // still shows something.
  const isActiveRow = overrideColStart !== undefined
    ? nowCol !== null
    : nowCol !== null
      ? rowIdx === Math.floor(nowCol / rowCols)
      : rowIdx === Math.ceil(colCount / rowCols) - 1

  const width = labelW + columns.length * colW

  // The offset is stored in base-column units and rescaled to whatever width
  // the row is actually rendered at, so zooming does not move the marker.
  const nowPx = isActiveRow && nowOffsetPx !== null && !caseEnded
    ? (nowOffsetPx - colStart * baseColW) * colW / baseColW
    : null

  const endOverlayLeft = endCol === null
    ? null
    : endCol < colStart
      ? 0
      : endCol < colEnd
        // The end column itself is still part of the case, so the overlay
        // begins after it.
        ? (endCol - colStart + 1) * colW
        : null

  return { colStart, colEnd, columns, isActiveRow, width, nowPx, endOverlayLeft }
}

/** Whether a bar runs past the right edge of this row. */
export function barContinues(barEndCol: number, rowColEnd: number): boolean {
  return barEndCol >= rowColEnd
}

const COLUMN_MS = 5 * 60_000

/**
 * Where a bar begins and ends inside its first and last cells, in pixels from
 * the cell edges, from its real start and stop (9.13.0). A bar used to end
 * 12 px short of its last cell whatever its real minute, to leave room for
 * the grip, so an infusion that ran into that column looked as if it had
 * stopped partway through; the grip now sits on the real end instead.
 *
 * A side the times cannot place -- no times (charts saved before 9.12.3,
 * agents and gases), or a bar being dragged whose times no longer match its
 * columns -- is null and keeps the column rule.
 */
export function barTimeInsets(
  seg: { startTs?: string; endTs?: string; startCol: number; endCol: number },
  colW: number,
): { left: number | null; right: number | null } {
  const start = Date.parse(seg.startTs ?? "")
  if (!Number.isFinite(start)) return { left: null, right: null }
  const firstColumn = Math.floor(start / COLUMN_MS) * COLUMN_MS
  const left = (start - firstColumn) / COLUMN_MS * colW
  const end = Date.parse(seg.endTs ?? "")
  if (!Number.isFinite(end) || end < start) return { left: Math.round(left), right: null }
  const fraction = (end - (firstColumn + (seg.endCol - seg.startCol) * COLUMN_MS)) / COLUMN_MS
  if (fraction < 0 || fraction > 1) return { left: Math.round(left), right: null }
  // A bar inside one cell stays at least 4 px wide, so it can still be seen and tapped.
  const right = seg.startCol === seg.endCol ? Math.min((1 - fraction) * colW, colW - left - 4) : (1 - fraction) * colW
  return { left: Math.round(left), right: Math.max(0, Math.round(right)) }
}

/** Whether a bar started before this row and enters it from the left. */
export function barEntersRow(barStartCol: number, rowColStart: number): boolean {
  return barStartCol < rowColStart
}

/** A bar is only rounded and bordered where it genuinely begins. */
export function barLeftClass(isVisualStart: boolean): string {
  return isVisualStart ? "left-1 border-l rounded-l-full" : "left-0"
}

/** …and only closed off where it genuinely ends rather than wrapping. */
export function barRightClass(barEndCol: number, isActualEnd: boolean, rowColEnd: number): string {
  return isActualEnd && !barContinues(barEndCol, rowColEnd)
    ? "right-3 border-r rounded-r-sm"
    : "right-0 border-r-0"
}

/**
 * The drag grip belongs only on a real, settled end. Showing it on a wrapped
 * bar would offer to drag an edge that is not there, and showing it during a
 * drag preview would let the handle chase the pointer.
 */
export function showBarGrip(
  barEndCol: number,
  isActualEnd: boolean,
  isDragPreview: boolean,
  rowColEnd: number,
): boolean {
  return isActualEnd && !barContinues(barEndCol, rowColEnd) && !isDragPreview
}
