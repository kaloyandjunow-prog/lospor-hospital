import { describe, expect, it } from "vitest"
import {
  buildIntraopTimingPatch,
  monthYearForDate,
  normalizeLoadedIntraopTiming,
  promoteDraftCaseToInProgress,
} from "./intraop-timing"

describe("loaded intraop timing", () => {
  it("formats the fallback month/year from the provided date", () => {
    expect(monthYearForDate(new Date("2026-07-15T12:00:00.000Z"))).toBe("2026-07")
  })

  it("normalizes saved month, HH:MM times, and next-day flag", () => {
    expect(normalizeLoadedIntraopTiming({
      monthYear: "2026-06",
      startTime: "08:30",
      endTime: "10:15",
      endTimeNextDay: 1,
    }, new Date("2026-07-15T12:00:00.000Z"))).toEqual({
      monthYear: "2026-06",
      startTime: "08:30",
      endTime: "10:15",
      endTimeNextDay: true,
      startedAt: null,
      endedAt: null,
      timezone: null,
    })
  })

  it("normalizes ISO times and falls back to current month/year", () => {
    expect(normalizeLoadedIntraopTiming({
      startTime: "2026-01-01T08:30:00.000Z",
      endTime: "2026-01-01T09:45:00.000Z",
    }, new Date("2026-07-15T12:00:00.000Z"))).toEqual({
      monthYear: "2026-07",
      startTime: "08:30",
      endTime: "09:45",
      endTimeNextDay: null,
      startedAt: null,
      endedAt: null,
      timezone: null,
    })
  })

  it("renders explicit instants in the persisted case timezone", () => {
    expect(normalizeLoadedIntraopTiming({
      startedAt: "2026-07-24T08:45:00.000Z",
      endedAt: "2026-07-24T10:00:00.000Z",
      timezone: "Europe/Sofia",
    }, new Date("2026-07-24T10:00:00.000Z"))).toMatchObject({
      startTime: "11:45",
      endTime: "13:00",
      timezone: "Europe/Sofia",
    })
  })
})

describe("buildIntraopTimingPatch", () => {
  it("maps empty timing values to null", () => {
    expect(buildIntraopTimingPatch({
      monthYear: "",
      startTime: "",
      endTime: "",
      endTimeNextDay: false,
    })).toEqual({
      monthYear: null,
      startTime: null,
      endTime: null,
      endTimeNextDay: false,
    })
  })

  it("uses overrides for start and end time", () => {
    expect(buildIntraopTimingPatch({
      monthYear: "2026-07",
      startTime: "08:00",
      endTime: "09:00",
      endTimeNextDay: true,
    }, { startTime: "07:30", endTime: "" })).toEqual({
      monthYear: "2026-07",
      startTime: "07:30",
      endTime: null,
      endTimeNextDay: true,
    })
  })

  it("preserves explicit instant fields and allows endedAt to be cleared", () => {
    expect(buildIntraopTimingPatch({
      monthYear: "2026-07",
      startTime: "11:45",
      endTime: "13:00",
      endTimeNextDay: false,
      startedAt: "2026-07-24T08:45:00.000Z",
      endedAt: "2026-07-24T10:00:00.000Z",
      timezone: "Europe/Sofia",
    }, { endedAt: null })).toMatchObject({
      startedAt: "2026-07-24T08:45:00.000Z",
      endedAt: null,
      timezone: "Europe/Sofia",
    })
  })
})

describe("promoteDraftCaseToInProgress", () => {
  it("promotes DRAFT cases and preserves other case data", () => {
    expect(promoteDraftCaseToInProgress({ status: "DRAFT", caseCode: "A1" })).toEqual({
      status: "IN_PROGRESS",
      caseCode: "A1",
    })
  })

  it("leaves non-draft and null cases unchanged", () => {
    const inProgress = { status: "IN_PROGRESS", caseCode: "A1" }
    expect(promoteDraftCaseToInProgress(inProgress)).toBe(inProgress)
    expect(promoteDraftCaseToInProgress(null)).toBeNull()
  })
})
