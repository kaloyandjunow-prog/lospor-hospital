import { describe, expect, it } from "vitest"
import {
  barContinues,
  barEntersRow,
  barLeftClass,
  barRightClass,
  computeRowGeometry,
  showBarGrip,
  type RowGeometryInput,
} from "./timetable-row-geometry"

/**
 * Two of these outputs are read clinically rather than decoratively: the "now"
 * marker tells an anaesthetist which five minutes they are documenting into,
 * and the post-case overlay marks where the record stops. An off-by-one in
 * either puts an event against the wrong column on a document that goes in the
 * patient's file, and it does so silently.
 */

function input(overrides: Partial<RowGeometryInput> = {}): RowGeometryInput {
  return {
    rowIdx: 0,
    rowCols: 12,
    colCount: 36,
    colW: 40,
    labelW: 60,
    nowCol: null,
    nowOffsetPx: null,
    baseColW: 40,
    endCol: null,
    caseEnded: false,
    ...overrides,
  }
}

describe("row bounds", () => {
  it("gives each row its own block of columns", () => {
    expect(computeRowGeometry(input({ rowIdx: 0 }))).toMatchObject({ colStart: 0, colEnd: 12 })
    expect(computeRowGeometry(input({ rowIdx: 2 }))).toMatchObject({ colStart: 24, colEnd: 36 })
  })

  it("stops the last row at the end of the chart rather than past it", () => {
    // A row running past colCount would render empty cells the case never had.
    const geometry = computeRowGeometry(input({ rowIdx: 2, colCount: 30 }))
    expect(geometry).toMatchObject({ colStart: 24, colEnd: 30 })
    expect(geometry.columns).toHaveLength(6)
  })

  it("honours explicit bounds, which printing and the summary use", () => {
    const geometry = computeRowGeometry(input({ overrideColStart: 5, overrideColEnd: 9 }))
    expect(geometry.columns).toEqual([5, 6, 7, 8])
  })

  it("sizes the row from the label gutter plus its columns", () => {
    expect(computeRowGeometry(input({ rowIdx: 0 })).width).toBe(60 + 12 * 40)
  })
})

describe("which row is active", () => {
  it("is the row holding the current column", () => {
    expect(computeRowGeometry(input({ rowIdx: 0, nowCol: 5 })).isActiveRow).toBe(true)
    expect(computeRowGeometry(input({ rowIdx: 1, nowCol: 5 })).isActiveRow).toBe(false)
    expect(computeRowGeometry(input({ rowIdx: 1, nowCol: 13 })).isActiveRow).toBe(true)
  })

  it("falls back to the last row before the case is live", () => {
    // Otherwise a chart that has not started highlights nothing at all.
    expect(computeRowGeometry(input({ rowIdx: 2, nowCol: null })).isActiveRow).toBe(true)
    expect(computeRowGeometry(input({ rowIdx: 0, nowCol: null })).isActiveRow).toBe(false)
  })
})

describe("the live marker", () => {
  it("is placed relative to the row it falls in", () => {
    // Column 13 of a 12-column row is one column into row 1.
    const geometry = computeRowGeometry(input({
      rowIdx: 1, nowCol: 13, nowOffsetPx: 13 * 40,
    }))
    expect(geometry.nowPx).toBe(40)
  })

  it("rescales when the row is rendered narrower than the base column", () => {
    // The offset is stored in base-column units, so zooming must not move it.
    const geometry = computeRowGeometry(input({
      rowIdx: 0, nowCol: 4, nowOffsetPx: 4 * 40, baseColW: 40, colW: 20,
    }))
    expect(geometry.nowPx).toBe(80)
  })

  it("disappears once the case has ended", () => {
    // A live marker on a finished case would suggest documentation is still open.
    expect(computeRowGeometry(input({
      rowIdx: 0, nowCol: 4, nowOffsetPx: 160, caseEnded: true,
    })).nowPx).toBeNull()
  })

  it("is absent from rows that do not hold it", () => {
    expect(computeRowGeometry(input({
      rowIdx: 0, nowCol: 20, nowOffsetPx: 800,
    })).nowPx).toBeNull()
  })
})

describe("the post-case overlay", () => {
  it("is absent while the row is entirely within the case", () => {
    expect(computeRowGeometry(input({ rowIdx: 0, endCol: 20 })).endOverlayLeft).toBeNull()
  })

  it("covers a row that lies entirely after the end", () => {
    expect(computeRowGeometry(input({ rowIdx: 2, endCol: 5 })).endOverlayLeft).toBe(0)
  })

  it("begins after the final column, which is still part of the case", () => {
    // endCol 3 means columns 0..3 were documented, so the overlay starts at 4.
    expect(computeRowGeometry(input({ rowIdx: 0, endCol: 3, colW: 40 })).endOverlayLeft).toBe(160)
  })

  it("treats the last column of a row as inside the case", () => {
    // endCol 11 is the final column of row 0; nothing on this row is post-case.
    expect(computeRowGeometry(input({ rowIdx: 0, endCol: 11 })).endOverlayLeft).toBe(12 * 40)
  })
})

describe("bar edges", () => {
  it("knows when a bar wraps past the end of the row", () => {
    expect(barContinues(12, 12)).toBe(true)
    expect(barContinues(11, 12)).toBe(false)
  })

  it("knows when a bar arrives from an earlier row", () => {
    expect(barEntersRow(11, 12)).toBe(true)
    expect(barEntersRow(12, 12)).toBe(false)
  })

  it("rounds and borders a bar only where it truly starts", () => {
    expect(barLeftClass(true)).toContain("rounded-l-full")
    expect(barLeftClass(false)).not.toContain("rounded")
  })

  it("closes a bar only where it truly ends", () => {
    expect(barRightClass(5, true, 12)).toContain("border-r")
    // Wraps to the next row: leave it open.
    expect(barRightClass(12, true, 12)).toContain("border-r-0")
    // Not the end of the bar at all.
    expect(barRightClass(5, false, 12)).toContain("border-r-0")
  })

  it("offers the drag grip only on a real, settled end", () => {
    expect(showBarGrip(5, true, false, 12)).toBe(true)
    // Wrapping bar: the edge shown is not the edge that would move.
    expect(showBarGrip(12, true, false, 12)).toBe(false)
    // Mid-drag: the handle must not chase the pointer.
    expect(showBarGrip(5, true, true, 12)).toBe(false)
  })
})
