import { describe, expect, it } from "vitest"

import {
  buildIntraopEndTiming,
  buildIntraopStartTiming,
  endInstantForWallClock,
  instantFromLocalTime,
  localTimeOf,
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
