import { describe, expect, it } from "vitest"
import { caseStartDateForHHMM, formatHHMM, formatTs, fmtElapsed, trendArrow } from "./intraop-format"

describe("formatTs", () => {
  it("formats a timestamp as zero-padded local HH:MM", () => {
    const d = new Date(2026, 0, 1, 7, 5)
    expect(formatTs(d.toISOString())).toBe("07:05")
  })
})

describe("formatHHMM", () => {
  it("formats a Date as zero-padded local HH:MM", () => {
    expect(formatHHMM(new Date(2026, 0, 1, 7, 5))).toBe("07:05")
  })
})

describe("caseStartDateForHHMM", () => {
  it("uses today when the requested time is not in the future", () => {
    const now = new Date(2026, 0, 2, 8, 30)
    expect(caseStartDateForHHMM("07:15", now)?.toISOString()).toBe(new Date(2026, 0, 2, 7, 15).toISOString())
  })

  it("uses yesterday when the requested time would be in the future", () => {
    const now = new Date(2026, 0, 2, 1, 30)
    expect(caseStartDateForHHMM("23:45", now)?.toISOString()).toBe(new Date(2026, 0, 1, 23, 45).toISOString())
  })

  it("returns null for invalid HH:MM values", () => {
    expect(caseStartDateForHHMM("bad")).toBeNull()
  })
})

describe("fmtElapsed", () => {
  it("shows minutes only under an hour", () => { expect(fmtElapsed(25 * 60_000)).toBe("25m") })
  it("shows hours and minutes past an hour", () => { expect(fmtElapsed(2 * 3_600_000 + 3 * 60_000)).toBe("2h 3m") })
  it("shows 0m for zero", () => { expect(fmtElapsed(0)).toBe("0m") })
})

describe("trendArrow", () => {
  it("is blank when a value is missing or the change is < 5", () => {
    expect(trendArrow(undefined, 5)).toBe("")
    expect(trendArrow(100, undefined)).toBe("")
    expect(trendArrow(100, 97)).toBe("")
  })
  it("points up or down when the change is >= 5", () => {
    expect(trendArrow(110, 100)).toBe(" ↑")
    expect(trendArrow(90, 100)).toBe(" ↓")
  })
})
