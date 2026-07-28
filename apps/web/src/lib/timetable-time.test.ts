import { describe, expect, it } from "vitest"
import { addMinutes, floorTo5, timeToMins, toHHMM, calcDuration } from "./timetable-time"

describe("addMinutes", () => {
  it("adds and wraps within a day", () => {
    expect(addMinutes("08:00", 30)).toBe("08:30")
    expect(addMinutes("23:50", 20)).toBe("00:10") // wraps past midnight
    expect(addMinutes("00:10", -20)).toBe("23:50") // wraps backwards
  })
})

describe("floorTo5", () => {
  it("floors minutes to the 5-minute grid", () => {
    expect(floorTo5("08:07")).toBe("08:05")
    expect(floorTo5("08:00")).toBe("08:00")
    expect(floorTo5("08:59")).toBe("08:55")
  })
})

describe("timeToMins", () => {
  it("converts HH:MM to minutes since midnight", () => {
    expect(timeToMins("00:00")).toBe(0)
    expect(timeToMins("01:30")).toBe(90)
  })
})

describe("toHHMM", () => {
  it("passes through HH:MM and reads ISO timestamps in UTC", () => {
    expect(toHHMM("08:30")).toBe("08:30")
    expect(toHHMM("2026-01-01T08:30:00.000Z")).toBe("08:30")
    expect(toHHMM("not-a-date")).toBe("not-a-date")
  })
})

describe("calcDuration", () => {
  it("uses end-start when an end is given (wrapping past midnight)", () => {
    expect(calcDuration("08:00", "10:30", 0)).toBe("2h 30min")
    expect(calcDuration("08:10", "08:40", 0)).toBe("30min")
    expect(calcDuration("23:30", "00:30", 0)).toBe("1h 0min")
  })
  it("falls back to column count (5 min each) with no end", () => {
    expect(calcDuration("08:00", undefined, 3)).toBe("15min")
    expect(calcDuration("08:00", undefined, 13)).toBe("1h 5min")
  })
})
