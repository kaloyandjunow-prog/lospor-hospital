import { describe, expect, it } from "vitest"

import type { LogEvent } from "./intraop-types"
import {
  activeTimetableColumnForTimestamp,
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
    expect(planned[2].event).toEqual({ type: "vital", etco2: 35, temp: 36.7, spO2: 98 })
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
        vital("2026-07-01T10:10:00.000Z", { bgl: 101 }),
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
    })[0].event).toEqual({ type: "vital", etco2: 35 })

    expect(planAutoFillVitalEvents({
      ...base,
      preferences: { enabled: true, includeBloodPressure: true },
    })[0].event).toEqual({
      type: "vital",
      etco2: 35,
      systolic: 120,
      diastolic: 70,
      heartRate: 80,
    })
  })
})
