import { describe, expect, it, vi } from "vitest"

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))

import { timelineStartInstant } from "./useIntraopEventTimeline"

describe("timelineStartInstant", () => {
  it("uses the saved start instant when there is one", () => {
    expect(timelineStartInstant({
      startedAt: "2026-09-20T06:10:00.000Z", startTime: "09:10", timezone: "Europe/Sofia", log: [],
    })).toBe("2026-09-20T06:10:00.000Z")
  })

  // 9.12.1: the pattern had lost its backslashes (/^d{2}:d{2}$/), so a case with
  // only a typed start time had no chart start and every edit said "start the
  // case first".
  it("derives the start from a typed HH:MM in the case zone, on the day of the first entry", () => {
    expect(timelineStartInstant({
      startedAt: null,
      startTime: "09:10",
      timezone: "Europe/Sofia",
      log: [{ ts: "2026-09-20T07:00:00.000Z" }, { ts: "2026-09-20T06:30:00.000Z" }],
    })).toBe("2026-09-20T06:10:00.000Z")
  })

  it("counts from now's day when nothing is charted yet", () => {
    expect(timelineStartInstant({
      startedAt: undefined, startTime: "08:00", timezone: "UTC", log: [],
      now: new Date("2026-09-26T12:00:00.000Z"),
    })).toBe("2026-09-26T08:00:00.000Z")
  })

  it("has no start without a well-formed time", () => {
    for (const startTime of [null, "", "8:00", "dd:dd", "08:00:00"]) {
      expect(timelineStartInstant({ startedAt: null, startTime, timezone: "UTC", log: [] })).toBeNull()
    }
  })
})
