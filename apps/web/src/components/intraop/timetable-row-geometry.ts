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
