import { describe, expect, it } from "vitest"

import {
  buildIntraopEndTiming,
  buildIntraopStartTiming,
  dayStepLabel,
  daysBetweenDateKeys,
  defaultEndDayOffset,
  durationMinutesBetween,
  earliestEndDateKey,
  endDayOffsetBetween,
  endDayOffsetLabel,
  endInstantForWallClock,
  formatDateKeyLong,
  instantFromDateKey,
  instantFromLocalTime,
  localDateKey,
  localTimeOf,
  monthYearOf,
  shiftDateKey,
  startInstantForWallClock,
} from "./intraop-time"

describe("intraoperative timing", () => {
  it("resolves Sofia summer and winter wall clocks without a fixed offset", () => {
    expect(
      instantFromLocalTime(
        new Date("2026-07-21T05:25:00.000Z"),
        "08:00",
        "Europe/Sofia",
      )?.toISOString(),
    ).toBe("2026-07-21T05:00:00.000Z")
    expect(
      instantFromLocalTime(
        new Date("2026-01-21T06:25:00.000Z"),
        "08:00",
        "Europe/Sofia",
      )?.toISOString(),
    ).toBe("2026-01-21T06:00:00.000Z")
  })

  it.each([
    ["UTC", "2026-07-21T08:00:00.000Z"],
    ["America/New_York", "2026-07-21T12:00:00.000Z"],
    ["Asia/Kolkata", "2026-07-21T02:30:00.000Z"],
    ["Australia/Adelaide", "2026-07-20T22:30:00.000Z"],
  ])("resolves 08:00 correctly in %s", (zone, expected) => {
    const day = new Date("2026-07-21T12:30:00.000Z")
    expect(instantFromLocalTime(day, "08:00", zone)?.toISOString()).toBe(expected)
  })

  it("uses the previous local day for a retrospective after-midnight start", () => {
    const now = new Date("2026-07-21T22:10:00.000Z") // 01:10 on 22 July in Sofia
    expect(
      startInstantForWallClock(now, "23:50", "Europe/Sofia")?.toISOString(),
    ).toBe("2026-07-21T20:50:00.000Z")
  })

  it("resolves an overnight end from the start's local calendar day", () => {
    const start = new Date("2026-07-21T20:50:00.000Z")
    expect(
      endInstantForWallClock(start, "01:10", "Europe/Sofia", true)?.toISOString(),
    ).toBe("2026-07-21T22:10:00.000Z")
  })

  it("round-trips start and end timing payloads", () => {
    const start = new Date("2026-07-21T05:00:00.000Z")
    const end = new Date("2026-07-21T06:30:00.000Z")
    expect(buildIntraopStartTiming(start, "Europe/Sofia")).toEqual({
      startTime: "08:00",
      startedAt: start.toISOString(),
      timezone: "Europe/Sofia",
    })
    expect(buildIntraopEndTiming(end, "Europe/Sofia")).toEqual({
      endTime: "09:30",
      endedAt: end.toISOString(),
      timezone: "Europe/Sofia",
    })
    expect(localTimeOf(start, "Europe/Sofia")).toBe("08:00")
  })
})

describe("a date beside the start and end of surgery", () => {
  const SOFIA = "Europe/Sofia"

  it("reads the date in the case's zone, not in UTC", () => {
    // 01:30 in Sofia on 16 October is still 15 October in UTC.
    expect(localDateKey(new Date("2026-10-15T22:30:00Z"), SOFIA)).toBe("2026-10-16")
    expect(monthYearOf(new Date("2026-10-31T22:30:00Z"), SOFIA)).toBe("2026-11")
  })

  it("places a time on a chosen date", () => {
    expect(instantFromDateKey("2026-10-14", "08:30", SOFIA)?.toISOString()).toBe("2026-10-14T05:30:00.000Z")
    expect(instantFromDateKey("2026-02-30", "08:30", SOFIA)).toBeNull()
    expect(instantFromDateKey("16.10.2026", "08:30", SOFIA)).toBeNull()
  })

  it("moves dates by calendar days, across a month and a year", () => {
    expect(shiftDateKey("2026-10-31", 1)).toBe("2026-11-01")
    expect(shiftDateKey("2027-01-01", -1)).toBe("2026-12-31")
    expect(daysBetweenDateKeys("2026-10-16", "2026-10-14")).toBe(-2)
  })

  // Summer time ends in Bulgaria on 25 October 2026: 04:00 EEST becomes 03:00 EET.
  it("keeps real durations across the end of summer time", () => {
    const start = instantFromDateKey("2026-10-25", "01:00", SOFIA)!
    const end = instantFromDateKey("2026-10-25", "06:00", SOFIA)!
    expect(start.toISOString()).toBe("2026-10-24T22:00:00.000Z")
    expect(end.toISOString()).toBe("2026-10-25T04:00:00.000Z")
    expect(durationMinutesBetween(start, end)).toBe(6 * 60)
    expect(localDateKey(end, SOFIA)).toBe("2026-10-25")
  })

  // Summer time starts on 28 March 2027: 03:00 EET becomes 04:00 EEST.
  it("keeps real durations across the start of summer time", () => {
    const start = instantFromDateKey("2027-03-28", "01:00", SOFIA)!
    const end = instantFromDateKey("2027-03-28", "06:00", SOFIA)!
    expect(durationMinutesBetween(start, end)).toBe(4 * 60)
  })

  it("puts an end earlier on the clock than the start on the next day, unless told otherwise", () => {
    const start = instantFromDateKey("2026-10-16", "22:40", SOFIA)!
    expect(defaultEndDayOffset(start, "01:15", SOFIA)).toBe(1)
    expect(defaultEndDayOffset(start, "23:50", SOFIA)).toBe(0)
    expect(endInstantForWallClock(start, "01:15", SOFIA, 1)?.toISOString()).toBe("2026-10-16T22:15:00.000Z")
    // A case longer than a day: the end date set two days on.
    expect(endInstantForWallClock(start, "09:00", SOFIA, 2)?.toISOString()).toBe("2026-10-18T06:00:00.000Z")
    // The older boolean still means one day.
    expect(endInstantForWallClock(start, "01:15", SOFIA, true)?.toISOString()).toBe("2026-10-16T22:15:00.000Z")
    expect(endInstantForWallClock(start, "01:15", SOFIA, -1)).toBeNull()
  })
})

describe("the words of the day stepper", () => {
  it("names nearby days, and the rest by weekday and date", () => {
    expect(dayStepLabel("2026-10-16", "2026-10-16", "en").text).toBe("Today")
    expect(dayStepLabel("2026-10-15", "2026-10-16", "bg").text).toBe("Вчера")
    expect(dayStepLabel("2026-10-14", "2026-10-16", "en").text).toBe("Wed 14.10")
    expect(dayStepLabel("2026-10-14", "2026-10-16", "bg").text).toMatch(/^ср\.? 14\.10$/)
  })
})

describe("the earliest end date", () => {
  it("never lets the end fall before the start", () => {
    const start = instantFromDateKey("2026-10-16", "22:40", "Europe/Sofia")!
    expect(earliestEndDateKey(start, "23:50", "Europe/Sofia")).toBe("2026-10-16")
    expect(earliestEndDateKey(start, "01:15", "Europe/Sofia")).toBe("2026-10-17")
    expect(earliestEndDateKey(start, "22:40", "Europe/Sofia")).toBe("2026-10-17")
  })
})



describe("the date of a record", () => {
  it("writes the long date each language uses", () => {
    expect(formatDateKeyLong("2026-10-05", "en")).toBe("05 Oct 2026")
    expect(formatDateKeyLong("2026-10-05", "bg")).toBe("05.10.2026")
    expect(formatDateKeyLong("bad", "en")).toBeNull()
  })

  it("counts the end's day from the start's in the case's zone", () => {
    // 22:40 to 01:10 in Sofia, which is 19:40 to 22:10 UTC: one day on, though UTC says none.
    expect(endDayOffsetBetween(new Date("2026-10-15T19:40:00Z"), new Date("2026-10-15T22:10:00Z"), "Europe/Sofia")).toBe(1)
    expect(endDayOffsetBetween(new Date("2026-10-15T07:00:00Z"), new Date("2026-10-15T09:00:00Z"), "Europe/Sofia")).toBe(0)
    expect(endDayOffsetLabel(1, "en")).toBe("+1 day")
    expect(endDayOffsetLabel(2, "bg")).toBe("+2 дни")
    expect(endDayOffsetLabel(0, "en")).toBeNull()
  })
})
