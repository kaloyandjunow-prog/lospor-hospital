import { describe, expect, it } from "vitest"
import { HOUR_AHEAD_COLUMNS, nowMarkerGeometry } from "./timetable-clock"

const start = Date.parse("2026-11-21T08:00:00.000Z")
const at = (minutes: number) => new Date(start + minutes * 60_000)

describe("now marker geometry", () => {
  it("keeps an hour of cells after now in the scrolling layout", () => {
    const geometry = nowMarkerGeometry({ gridStartMs: start, now: at(32), intervalMinutes: 5, columnWidthPx: 80, colCount: 12, layout: "scroll", rowCols: 12 })
    expect(geometry.trueCol).toBe(6)
    expect(geometry.requiredColCount).toBe(6 + 1 + HOUR_AHEAD_COLUMNS)
  })

  it("grows the expanded layout by whole rows", () => {
    const geometry = nowMarkerGeometry({ gridStartMs: start, now: at(32), intervalMinutes: 5, columnWidthPx: 80, colCount: 12, layout: "expand", rowCols: 12 })
    expect(geometry.requiredColCount).toBe(24)
  })

  it("asks for nothing when the table already reaches an hour ahead", () => {
    const geometry = nowMarkerGeometry({ gridStartMs: start, now: at(32), intervalMinutes: 5, columnWidthPx: 80, colCount: 30, layout: "scroll", rowCols: 12 })
    expect(geometry.requiredColCount).toBeNull()
  })

  it("draws nothing before the case starts", () => {
    expect(nowMarkerGeometry({ gridStartMs: start, now: at(-5), intervalMinutes: 5, columnWidthPx: 80, colCount: 12, layout: "scroll", rowCols: 12 }).offsetPx).toBeNull()
  })
})
