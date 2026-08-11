/**
 * Where Tab goes in the vitals grid.
 *
 * Vitals are entered in bursts — a set of observations for one time, then the
 * next time — so Tab walks down the column it is in and then jumps to the top
 * of the next one. The browser's own Tab order would run along the row instead,
 * entering every patient's systolic before any diastolic, which is the opposite
 * of how a set of observations is read out.
 *
 * Returning null means stop: there is no next field, and the last column of the
 * chart should not silently wrap round to the beginning.
 */
export function nextVitalsField({
  rowKeys,
  currentKey,
  col,
  colCount,
}: {
  /** The vitals lanes currently shown, in the order they appear. */
  rowKeys: readonly string[]
  currentKey: string
  col: number
  /** Total columns on the chart. */
  colCount: number
}): { col: number; key: string } | null {
  const rowIndex = rowKeys.indexOf(currentKey)
  if (rowIndex === -1) return null

  // Still inside this time's set of observations.
  if (rowIndex < rowKeys.length - 1) {
    return { col, key: rowKeys[rowIndex + 1] }
  }

  // Bottom of the column: move on to the next time, starting at the top again.
  const nextCol = col + 1
  if (nextCol >= colCount || rowKeys.length === 0) return null
  return { col: nextCol, key: rowKeys[0] }
}
