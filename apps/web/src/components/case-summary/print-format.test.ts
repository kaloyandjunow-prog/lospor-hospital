import { describe, expect, it } from "vitest"

import { printDuration, printGeneratedDate, printMonthYear, printTimeSpan } from "./print-format"

describe("printed record dates and durations", () => {
  it("names the month in the record's language", () => {
    expect(printMonthYear("2026-09", "en")).toBe("September 2026")
    expect(printMonthYear("2026-09", "bg")).toBe("Септември 2026")
    expect(printMonthYear(null, "bg")).toBe("")
  })

  it("writes the duration in the record's language", () => {
    expect(printDuration(31, "en")).toBe("0h 31m")
    expect(printDuration(125, "en")).toBe("2h 05m")
    expect(printDuration(31, "bg")).toBe("0 ч 31 мин")
    expect(printDuration(125, "bg")).toBe("2 ч 5 мин")
    expect(printTimeSpan("2026-09-27T14:43:00Z", "2026-09-27T15:14:00Z", "bg")).toBe("14:43 → 15:14 · 0 ч 31 мин")
    expect(printTimeSpan(null, "2026-09-27T15:14:00Z", "en")).toBeNull()
  })

  it("dates the footer the way each language writes a date", () => {
    const date = new Date(2026, 8, 27, 12)
    expect(printGeneratedDate(date, "en")).toBe("27 Sep 2026")
    expect(printGeneratedDate(date, "bg")).toBe("27.09.2026")
  })

  it("dates the footer on the case's calendar, not the server's", () => {
    // 23:30 UTC on 26 Sep is 02:30 on 27 Sep in Sofia; a GMT+1 server says the 27th
    // only after 23:00 UTC, UTC says the 26th.
    const late = new Date("2026-09-26T23:30:00.000Z")
    expect(printGeneratedDate(late, "bg", "Europe/Sofia")).toBe("27.09.2026")
    expect(printGeneratedDate(late, "en", "Europe/Sofia")).toBe("27 Sep 2026")
    expect(printGeneratedDate(late, "en", "America/New_York")).toBe("26 Sep 2026")
  })
})
