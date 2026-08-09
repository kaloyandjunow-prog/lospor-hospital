import { describe, expect, it } from "vitest"
import {
  MAX_OVERNIGHT_ELAPSED_SECS,
  elapsedSecsSinceStart,
  gridOriginMs,
  resolveStartAnchor,
  secondsFromGridOrigin,
} from "./intraop-clock"

/**
 * The intraop form stores the start as a bare "HH:MM" with no date, so a start
 * later than the clock is ambiguous: an overnight case, or a time typed in the
 * future. Reading that wrongly once walked the now-marker forward, grew the
 * timetable every tick, and — through the vitals backfill — could write hours of
 * observations into the record that never happened. These cases pin the rule.
 *
 * Local-time Dates throughout, because the function anchors to local midnight.
 */
const at = (h: number, m = 0) => new Date(2026, 7, 4, h, m, 0, 0)
const localMs = (day: number, h: number, m = 0) =>
  new Date(2026, 7, day, h, m, 0, 0).getTime()

describe("resolveStartAnchor", () => {
  it("anchors to today when the start is already behind the clock", () => {
    expect(resolveStartAnchor("08:00", at(10))).toBe(localMs(4, 8))
  })

  it("treats start === now as started, not as a future time", () => {
    expect(resolveStartAnchor("10:00", at(10))).toBe(localMs(4, 10))
  })

  it("reads a start ahead of the clock as an overnight case that crossed midnight", () => {
    // 02:00, case started 22:00 -> yesterday, 4 h ago.
    expect(resolveStartAnchor("22:00", at(2))).toBe(localMs(3, 22))
  })

  it("still wraps at exactly the overnight limit", () => {
    // 10:00 with a 22:00 start is exactly 12 h — inclusive, so it wraps.
    expect(resolveStartAnchor("22:00", at(10))).toBe(localMs(3, 22))
    expect((at(10).getTime() - localMs(3, 22)) / 1000).toBe(MAX_OVERNIGHT_ELAPSED_SECS)
  })

  it("refuses a start beyond the limit — a planned start or a typo, not a case", () => {
    // 11:00 with a 22:00 start implies 13 h elapsed: too long to still be running.
    // Returning null is what stops the fabricated-observation backfill.
    expect(resolveStartAnchor("22:00", at(11))).toBeNull()
  })

  it("floors the start to the 5-minute column grid", () => {
    expect(resolveStartAnchor("08:07", at(10))).toBe(localMs(4, 8, 5))
    expect(resolveStartAnchor("08:59", at(10))).toBe(localMs(4, 8, 55))
  })

  it("falls back to 08:00 for a missing or unparseable start", () => {
    expect(resolveStartAnchor(undefined, at(10))).toBe(localMs(4, 8))
    expect(resolveStartAnchor("", at(10))).toBe(localMs(4, 8))
  })
})

describe("elapsedSecsSinceStart", () => {
  it("counts from the resolved anchor", () => {
    expect(elapsedSecsSinceStart("08:00", at(10))).toBe(2 * 3600)
    expect(elapsedSecsSinceStart("22:00", at(2))).toBe(4 * 3600)
  })

  it("is null when the case has not begun", () => {
    expect(elapsedSecsSinceStart("22:00", at(11))).toBeNull()
  })

  it("never returns a negative elapsed time", () => {
    const secs = elapsedSecsSinceStart("10:00", at(10))
    expect(secs).not.toBeNull()
    expect(secs!).toBeGreaterThanOrEqual(0)
  })
})

describe("gridOriginMs / secondsFromGridOrigin", () => {
  // A case started 22:37 belongs to the 22:35-22:40 column.
  const started = new Date(2026, 7, 4, 22, 37, 0, 0).getTime()
  const column0 = new Date(2026, 7, 4, 22, 35, 0, 0).getTime()

  it("floors the start to column 0's own beginning", () => {
    expect(gridOriginMs(started)).toBe(column0)
  })

  it("leaves a start already on a column boundary alone", () => {
    const onGrid = new Date(2026, 7, 4, 22, 35, 0, 0).getTime()
    expect(gridOriginMs(onGrid)).toBe(onGrid)
  })

  it("puts the marker at the wall clock, not on the gridline behind it", () => {
    // The defect: measuring from 22:37 gave 0 s at 22:37, drawing the marker on
    // the 22:35 line and leaving it up to 4:59 early for the whole case.
    expect(secondsFromGridOrigin(started, new Date(2026, 7, 4, 22, 37))).toBe(120)
  })

  it("reaches the next column boundary exactly on the clock", () => {
    // 22:40 is the start of column 1 = 300 s from origin.
    expect(secondsFromGridOrigin(started, new Date(2026, 7, 4, 22, 40))).toBe(300)
  })

  it("is null before the case begins, and for a missing start", () => {
    expect(secondsFromGridOrigin(started, new Date(2026, 7, 4, 22, 30))).toBeNull()
    expect(secondsFromGridOrigin(null, new Date())).toBeNull()
    expect(gridOriginMs(null)).toBeNull()
    expect(gridOriginMs(Number.NaN)).toBeNull()
  })
})
