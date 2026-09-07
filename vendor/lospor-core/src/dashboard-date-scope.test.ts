import { describe, expect, it } from "vitest"
import { calendarDayKey, calendarMonthKey, isSameCalendarDay, isSameCalendarMonth } from "./dashboard-date-scope"

describe("calendarDayKey", () => {
  it("reads the day in the given timezone, not UTC", () => {
    // 23:30 UTC on Jan 1st is already Jan 2nd in Sofia (UTC+2 in winter).
    const d = new Date("2026-01-01T23:30:00.000Z")
    expect(calendarDayKey(d, "UTC")).toBe("2026-01-01")
    expect(calendarDayKey(d, "Europe/Sofia")).toBe("2026-01-02")
  })
})

describe("isSameCalendarDay", () => {
  it("agrees across the UTC boundary when both are read in Sofia time", () => {
    const late = new Date("2026-01-01T23:30:00.000Z")
    const early = new Date("2026-01-02T00:30:00.000Z")
    expect(isSameCalendarDay(late, early, "Europe/Sofia")).toBe(true)
    expect(isSameCalendarDay(late, early, "UTC")).toBe(false)
  })
})

describe("calendarMonthKey / isSameCalendarMonth", () => {
  it("reads the month in the given timezone", () => {
    const d = new Date("2026-01-31T23:00:00.000Z")
    expect(calendarMonthKey(d, "UTC")).toBe("2026-01")
    expect(calendarMonthKey(d, "Europe/Sofia")).toBe("2026-02")
  })

  it("compares two instants by calendar month", () => {
    const a = new Date("2026-02-01T05:00:00.000Z")
    const b = new Date("2026-02-27T05:00:00.000Z")
    const c = new Date("2026-03-01T05:00:00.000Z")
    expect(isSameCalendarMonth(a, b)).toBe(true)
    expect(isSameCalendarMonth(a, c)).toBe(false)
  })
})
