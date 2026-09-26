import { describe, expect, it } from "vitest"

import type { LogEvent } from "./intraop-types"
import {
  activeTimetableColumnForTimestamp,
  intraopVitalHardError,
  intraopVitalWarning,
  invalidIntraopVitalFields,
  isAutoFillPaused,
  latestVitalSnapshot,
  normalizeAutoFillVitalsPreferences,
  planAutoFillVitalEvents,
} from "./intraop-vitals"

const vital = (ts: string, patch: Partial<LogEvent>): LogEvent => ({
  id: `vital-${ts}`,
  ts,
  type: "vital",
  ...patch,
})

describe("intraop auto-fill vitals", () => {
  it("treats BP and reopen backfill as children of the master toggle", () => {
    expect(normalizeAutoFillVitalsPreferences({
      enabled: false,
      includeBloodPressure: true,
      backfillOnReopen: true,
    })).toEqual({
      enabled: false,
      includeBloodPressure: false,
      backfillOnReopen: false,
    })

    expect(normalizeAutoFillVitalsPreferences({
      enabled: true,
      includeBloodPressure: true,
      backfillOnReopen: true,
    })).toEqual({
      enabled: true,
      includeBloodPressure: true,
      backfillOnReopen: true,
    })
  })

  it("returns null for timestamps before the chart start", () => {
    const chartStart = new Date("2026-07-01T10:00:00.000Z")
    expect(activeTimetableColumnForTimestamp(chartStart, new Date("2026-07-01T09:59:59.000Z").getTime())).toBeNull()
    expect(activeTimetableColumnForTimestamp(chartStart, new Date("2026-07-01T10:14:59.000Z").getTime())).toBe(2)
  })

  it("plans all missed columns during a multi-column jump", () => {
    const chartStart = new Date("2026-07-01T10:00:00.000Z")
    const planned = planAutoFillVitalEvents({
      chartStart,
      fromCol: 1,
      toCol: 3,
      preferences: { enabled: true },
      log: [vital("2026-07-01T10:00:00.000Z", { etco2: 35, spO2: 98, temp: 36.7 })],
    })

    expect(planned.map(event => event.col)).toEqual([1, 2, 3])
    expect(planned.map(event => event.ts)).toEqual([
      "2026-07-01T10:05:00.000Z",
      "2026-07-01T10:10:00.000Z",
      "2026-07-01T10:15:00.000Z",
    ])
    expect(planned[2].event).toEqual({ type: "vital", autoFilled: true, etco2: 35, temp: 36.7, spO2: 98 })
  })

  it("skips columns that already have a vital event", () => {
    const chartStart = new Date("2026-07-01T10:00:00.000Z")
    const planned = planAutoFillVitalEvents({
      chartStart,
      fromCol: 1,
      toCol: 3,
      preferences: { enabled: true },
      log: [
        vital("2026-07-01T10:00:00.000Z", { etco2: 35 }),
        vital("2026-07-01T10:10:00.000Z", { heartRate: 72 }),
      ],
    })

    expect(planned.map(event => event.col)).toEqual([1])
  })

  it("copies BP and heart rate only when the option is enabled", () => {
    const chartStart = new Date("2026-07-01T10:00:00.000Z")
    const base = {
      chartStart,
      fromCol: 1,
      toCol: 1,
      log: [vital("2026-07-01T10:00:00.000Z", {
        etco2: 35,
        systolic: 120,
        diastolic: 70,
        heartRate: 80,
      })],
    }

    expect(planAutoFillVitalEvents({
      ...base,
      preferences: { enabled: true, includeBloodPressure: false },
    })[0].event).toEqual({ type: "vital", autoFilled: true, etco2: 35 })

    expect(planAutoFillVitalEvents({
      ...base,
      preferences: { enabled: true, includeBloodPressure: true },
    })[0].event).toEqual({
      type: "vital",
      autoFilled: true,
      etco2: 35,
      systolic: 120,
      diastolic: 70,
      heartRate: 80,
    })
  })
})

describe("intraoperative vital entry contract", () => {
  it("keeps device scales hard while preserving chartable clinical extremes", () => {
    expect(intraopVitalHardError("bis", 101)).toBe("above_max")
    expect(intraopVitalHardError("bis", 38.5)).toBe("not_integer")
    expect(intraopVitalHardError("tofRatio", 1.1)).toBe("above_max")
    expect(intraopVitalHardError("spO2", 101)).toBe("above_max")
    expect(intraopVitalHardError("systolic", 301)).toBeNull()
    expect(intraopVitalHardError("heartRate", 39)).toBeNull()
    expect(intraopVitalHardError("temp", 27)).toBeNull()
    expect(intraopVitalHardError("cvp", -2)).toBeNull()
  })

  it("marks plausibility warnings without turning them into hard errors", () => {
    expect(intraopVitalWarning("systolic", 301)).toBe("high")
    expect(intraopVitalWarning("diastolic", 151)).toBe("high")
    expect(intraopVitalWarning("heartRate", 39)).toBe("low")
    expect(intraopVitalWarning("heartRate", 251)).toBe("high")
    expect(intraopVitalWarning("temp", 27)).toBe("low")
    expect(intraopVitalWarning("temp", 42)).toBe("high")
    expect(invalidIntraopVitalFields({ systolic: 301, heartRate: 39, temp: 42 })).toEqual([])
  })

  it("builds the cockpit snapshot from the latest observation of each field", () => {
    expect(latestVitalSnapshot([
      vital("2026-09-15T20:05:00.000Z", { bis: 50, tofRatio: 0.9 }),
      vital("2026-09-15T20:00:00.000Z", { systolic: 120, diastolic: 70, heartRate: 75 }),
    ])).toEqual({ bis: 50, tofRatio: 0.9, systolic: 120, diastolic: 70, heartRate: 75 })
  })
})

describe("intraop auto-fill limits (1.4.9)", () => {
  const chartStart = new Date("2026-09-26T10:00:00.000Z")
  const on = { enabled: true }
  const minutes = (m: number) => new Date(chartStart.getTime() + m * 60_000)
  const log = [vital("2026-09-26T10:00:00.000Z", { etco2: 35 })]

  it("never reaches more than 30 minutes back from now", () => {
    const planned = planAutoFillVitalEvents({
      log, chartStart, fromCol: 1, toCol: 24, preferences: on, now: minutes(122),
    })
    // now is column 24; the last 30 minutes are columns 19..24.
    expect(planned.map(item => item.col)).toEqual([19, 20, 21, 22, 23, 24])
  })

  it("never fills the future or past the case end", () => {
    expect(planAutoFillVitalEvents({
      log, chartStart, fromCol: 1, toCol: 10, preferences: on, now: minutes(12),
    }).map(item => item.col)).toEqual([1, 2])
    expect(planAutoFillVitalEvents({
      log, chartStart, fromCol: 1, toCol: 10, preferences: on, now: minutes(30), endedAt: minutes(14),
    }).map(item => item.col)).toEqual([1, 2])
  })

  it("stops at the pause instant", () => {
    expect(planAutoFillVitalEvents({
      log, chartStart, fromCol: 1, toCol: 20, preferences: on, now: minutes(70), pauseAt: minutes(60).getTime(),
    }).map(item => item.col)).toEqual([9, 10, 11])
  })

  it("pauses 60 minutes after the last manual entry, not an auto-filled one", () => {
    const withAuto = [...log, vital("2026-09-26T10:40:00.000Z", { etco2: 35, autoFilled: true })]
    expect(isAutoFillPaused({ log: withAuto, chartStart, now: minutes(59) })).toBe(false)
    expect(isAutoFillPaused({ log: withAuto, chartStart, now: minutes(60) })).toBe(true)
    expect(isAutoFillPaused({ log: withAuto, chartStart, now: minutes(60), acknowledgedAt: minutes(50) })).toBe(false)
    // A future-dated draft is not activity.
    const planned = [...log, { id: "d", ts: "2026-09-26T13:00:00.000Z", type: "drug" as const, name: "X" }]
    expect(isAutoFillPaused({ log: planned, chartStart, now: minutes(61) })).toBe(true)
  })
})
