import { describe, expect, it } from "vitest"

import { printCaseDate, printDuration, printGeneratedDate, printMonthYear, printTimeSpan } from "./print-format"

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

describe("the day of the case on the printed record", () => {
  it("prints the start's date in the case's zone, the month for an older case", () => {
    // 23:30 in Sofia on 15 Oct is still 15 Oct there, though UTC is 20:30.
    expect(printCaseDate({ startedAt: "2026-10-15T20:30:00Z", timezone: "Europe/Sofia", monthYear: "2026-10" }, "en")).toBe("15 Oct 2026")
    expect(printCaseDate({ startedAt: "2026-10-15T20:30:00Z", timezone: "Europe/Sofia" }, "bg")).toBe("15.10.2026")
    expect(printCaseDate({ startedAt: null, timezone: null, monthYear: "2026-09" }, "en")).toBe("September 2026")
  })

  it("marks an end on a later day, and takes the duration from the stored instants", () => {
    const span = printTimeSpan("1970-01-01T22:40:00Z", "1970-01-02T01:10:00Z", "en", {
      startedAt: "2026-10-15T19:40:00Z", endedAt: "2026-10-15T22:10:00Z", timezone: "Europe/Sofia",
    })
    expect(span).toBe("22:40 → 01:10 (+1 day) · 2h 30m")
    expect(printTimeSpan("1970-01-01T08:05:00Z", "1970-01-01T09:40:00Z", "bg", null)).toBe("08:05 → 09:40 · 1 ч 35 мин")
  })
})
