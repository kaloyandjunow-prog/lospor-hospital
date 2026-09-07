import { describe, expect, it } from "vitest"
import type { PlannedAutoFilledVitalEvent } from "@lospor/core/intraop-vitals"
import type { VitalsEntry } from "@/types/timetable"
import {
  applyAutoFillVitalPlan,
  hasAnyVitalValue,
  vitalsToAutoFillLog,
} from "./intraop-autofill-vitals"

/**
 * Auto-fill writes observations into a clinical record. The two invariants below
 * are the difference between "carried the last reading forward for readability"
 * and "invented a measurement": a recorded value is never overwritten, and only
 * the planned columns are touched.
 */
const plan = (col: number, event: Partial<VitalsEntry>): PlannedAutoFilledVitalEvent =>
  ({ col, event } as unknown as PlannedAutoFilledVitalEvent)

describe("hasAnyVitalValue", () => {
  it("is true only when a number was actually recorded", () => {
    expect(hasAnyVitalValue({ heartRate: 70 } as VitalsEntry)).toBe(true)
    expect(hasAnyVitalValue({ temp: 36.5 } as VitalsEntry)).toBe(true)
    expect(hasAnyVitalValue({} as VitalsEntry)).toBe(false)
    expect(hasAnyVitalValue(undefined)).toBe(false)
  })

  it("ignores non-numeric junk rather than treating the column as recorded", () => {
    expect(hasAnyVitalValue({ heartRate: null } as unknown as VitalsEntry)).toBe(false)
    expect(hasAnyVitalValue({ heartRate: "70" } as unknown as VitalsEntry)).toBe(false)
  })
})

describe("vitalsToAutoFillLog", () => {
  const chartStart = new Date(2026, 7, 4, 8, 0, 0, 0)

  it("emits one event per recorded column, timed off the grid origin", () => {
    const log = vitalsToAutoFillLog(
      [{ heartRate: 70 } as VitalsEntry, {} as VitalsEntry, { spO2: 98 } as VitalsEntry],
      chartStart,
    )
    expect(log).toHaveLength(2)
    // Column 2 is two 5-minute columns after the origin.
    expect(log[1]!.ts).toBe(new Date(2026, 7, 4, 8, 10, 0, 0).toISOString())
  })

  it("skips empty columns, so a gap in monitoring is not invented", () => {
    expect(vitalsToAutoFillLog([{} as VitalsEntry, {} as VitalsEntry], chartStart)).toEqual([])
    expect(vitalsToAutoFillLog(undefined, chartStart)).toEqual([])
  })
})

describe("applyAutoFillVitalPlan", () => {
  it("fills only columns that are empty", () => {
    const vitals = [{ heartRate: 70 } as VitalsEntry]
    const result = applyAutoFillVitalPlan(vitals, [plan(1, { heartRate: 72 })])
    expect(result.vitals[1]).toMatchObject({ heartRate: 72 })
    expect(result.filledCols).toEqual([1])
  })

  it("NEVER overwrites a recorded observation", () => {
    // The core invariant: a real measurement always beats a projected one.
    const vitals = [{ heartRate: 70 } as VitalsEntry]
    const result = applyAutoFillVitalPlan(vitals, [plan(0, { heartRate: 999 })])
    expect(result.vitals[0]).toMatchObject({ heartRate: 70 })
    expect(result.filledCols).toEqual([])
  })

  it("fills only the absent keys of a partially recorded column", () => {
    const vitals = [{ heartRate: 70 } as VitalsEntry]
    const result = applyAutoFillVitalPlan(vitals, [plan(0, { heartRate: 999, spO2: 97 })])
    expect(result.vitals[0]).toMatchObject({ heartRate: 70, spO2: 97 })
    expect(result.filledCols).toEqual([0])
  })

  it("reports no change and keeps the same array when nothing was filled", () => {
    const vitals = [{ heartRate: 70 } as VitalsEntry]
    const result = applyAutoFillVitalPlan(vitals, [])
    expect(result.filledCols).toEqual([])
    expect(result.vitals).toBe(vitals)
  })

  it("does not mutate the array it was given", () => {
    const vitals = [{ heartRate: 70 } as VitalsEntry]
    const snapshot = JSON.stringify(vitals)
    applyAutoFillVitalPlan(vitals, [plan(2, { heartRate: 72 })])
    expect(JSON.stringify(vitals)).toBe(snapshot)
  })

  it("grows the grid to reach a later planned column", () => {
    const result = applyAutoFillVitalPlan([{ heartRate: 70 } as VitalsEntry], [plan(3, { heartRate: 72 })])
    expect(result.vitals).toHaveLength(4)
    expect(result.vitals[3]).toMatchObject({ heartRate: 72 })
    expect(result.filledCols).toEqual([3])
  })

  it("ignores non-numeric planned values", () => {
    const result = applyAutoFillVitalPlan([], [plan(0, { heartRate: undefined })])
    expect(result.filledCols).toEqual([])
  })
})
