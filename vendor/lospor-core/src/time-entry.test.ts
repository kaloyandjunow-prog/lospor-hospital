import { describe, expect, it } from "vitest"
import {
  calendarDateKey,
  clampCalendarDate,
  daysInMonth,
  formatClockTime,
  instantForTimeInCase,
  parseCalendarDateKey,
  parseTypedTime,
  typedTimeProgress,
  wrapWheel,
} from "./time-entry"

describe("typed time", () => {
  it("reads digits and separators", () => {
    expect(parseTypedTime("1024")).toEqual({ hour: 10, minute: 24 })
    expect(parseTypedTime("924")).toEqual({ hour: 9, minute: 24 })
    expect(parseTypedTime("9")).toEqual({ hour: 9, minute: 0 })
    expect(parseTypedTime("10:24")).toEqual({ hour: 10, minute: 24 })
    expect(parseTypedTime("10.5")).toEqual({ hour: 10, minute: 5 })
    expect(parseTypedTime("0015")).toEqual({ hour: 0, minute: 15 })
  })

  it("refuses what is not a time", () => {
    for (const text of ["", "2460", "1075", "ab", "12345", "24"]) expect(parseTypedTime(text)).toBeNull()
  })

  it("shows the progress while typing", () => {
    expect(typedTimeProgress("1")).toBe("1")
    expect(typedTimeProgress("102")).toBe("1:02")
    expect(typedTimeProgress("1024")).toBe("10:24")
    expect(formatClockTime({ hour: 7, minute: 5 })).toBe("07:05")
  })

  it("loops the wheels", () => {
    expect(wrapWheel(24, 24)).toBe(0)
    expect(wrapWheel(-1, 60)).toBe(59)
  })
})

describe("date wheel", () => {
  it("keeps the day within its month", () => {
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(clampCalendarDate({ year: 2026, month: 2, day: 31 })).toEqual({ year: 2026, month: 2, day: 28 })
    expect(clampCalendarDate({ year: 1990, month: 13, day: 0 })).toEqual({ year: 2000, month: 12, day: 1 })
    expect(calendarDateKey({ year: 2026, month: 11, day: 3 })).toBe("2026-11-03")
    expect(parseCalendarDateKey("2026-02-30")).toBeNull()
    expect(parseCalendarDateKey("2026-11-21")).toEqual({ year: 2026, month: 11, day: 21 })
  })
})

describe("a time inside a case", () => {
  it("reads 00:15 after a 23:20 start as the next day", () => {
    const startedAt = new Date("2026-11-21T21:20:00.000Z") // 23:20 in Sofia
    const instant = instantForTimeInCase({ hour: 0, minute: 15 }, { timeZone: "Europe/Sofia", reference: new Date("2026-11-21T22:30:00.000Z"), startedAt })
    expect(instant?.toISOString()).toBe("2026-11-21T22:15:00.000Z")
  })

  it("keeps a time on the reference day when the case allows it", () => {
    const instant = instantForTimeInCase({ hour: 10, minute: 30 }, { timeZone: "Europe/Sofia", reference: new Date("2026-11-21T09:00:00.000Z"), startedAt: new Date("2026-11-21T06:00:00.000Z") })
    expect(instant?.toISOString()).toBe("2026-11-21T08:30:00.000Z")
  })
})
