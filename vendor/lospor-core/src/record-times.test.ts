import { describe, expect, it } from "vitest"

import { projectIntraopEvents } from "./intraop-engine"
import { buildDrugLogEntries as buildRecordDrugLog, eventClockTimes, formatColumnTime } from "./intraop-summary"
import { startInstantForWallClock } from "./intraop-time"
import { buildDrugLogEntries, colToHHMM } from "./summary-timetable"
import type { LogEvent } from "./intraop-types"

// Times on the record (9.13.0). Run under several machine time zones -- UTC,
// GMT+1 as the hosted servers are, Sofia, New York -- and the answers must not
// move: a hand-picked 15:22 came back as 14:22 or 13:22 when a conversion
// used the machine's zone instead of the case's.

const ZONE = "Europe/Sofia"

describe("the record's times do not depend on the machine's time zone", () => {
  it("a hand-picked 15:22 Sofia start is 15:22 wherever it is read", () => {
    const start = startInstantForWallClock(new Date("2026-09-27T12:30:00.000Z"), "15:22", ZONE)
    expect(start?.toISOString()).toBe("2026-09-27T12:22:00.000Z")
    expect(eventClockTimes([{ id: "s", ts: start!.toISOString() }], ZONE).get("s")).toBe("15:22")
  })

  it("labels rows from the five-minute row the start falls in", () => {
    // Legacy wall clock, stored as a UTC-encoded 14:43.
    expect(colToHHMM(0, "2026-09-27T14:43:00.000Z")).toBe("14:40")
    expect(colToHHMM(2, "2026-09-27T14:43:00.000Z")).toBe("14:50")
    expect(formatColumnTime(2, "2026-09-27T14:43:00.000Z", 5, "utc")).toBe("14:50")
  })

  it("prints each dose at its own minute, in the case's zone", () => {
    const startedAt = "2026-09-27T11:43:00.000Z" // 14:43 in Sofia
    const log: LogEvent[] = [{ id: "d", ts: "2026-09-27T11:50:00.000Z", type: "drug", name: "Rocuronium", dose: "50", unit: "mg" }]
    const chart = projectIntraopEvents(log, { start: startedAt, openThrough: "2026-09-27T12:30:00.000Z" })
    const kev = { ...chart, log }
    // Its row reads 14:50 and so does the dose: 14:50 exactly, not 14:53.
    expect(buildDrugLogEntries(kev, "2026-09-27T14:43:00.000Z", ZONE)[0].time).toBe("14:50")
    expect(buildRecordDrugLog(chart, "2026-09-27T14:43:00.000Z", "utc", eventClockTimes(log, ZONE))[0].time).toBe("14:50")
    // A dose at 14:52 prints as 14:52, not as its row.
    const later = [{ ...log[0], ts: "2026-09-27T11:52:00.000Z" }]
    const laterChart = { ...projectIntraopEvents(later, { start: startedAt, openThrough: "2026-09-27T12:30:00.000Z" }), log: later }
    expect(buildDrugLogEntries(laterChart, "2026-09-27T14:43:00.000Z", ZONE)[0].time).toBe("14:52")
  })

  it("keeps Sofia time across the change back from summer time", () => {
    // 25 Oct 2026, 04:00 Sofia summer time becomes 03:00 winter time.
    const times = eventClockTimes([
      { id: "before", ts: "2026-10-25T00:30:00.000Z" },
      { id: "after", ts: "2026-10-25T01:30:00.000Z" },
    ], ZONE)
    expect(times.get("before")).toBe("03:30")
    expect(times.get("after")).toBe("03:30")
  })

  it("falls back to the row without a zone, never to the machine's", () => {
    expect(eventClockTimes([{ id: "d", ts: "2026-09-27T11:50:00.000Z" }], null).size).toBe(0)
  })
})
