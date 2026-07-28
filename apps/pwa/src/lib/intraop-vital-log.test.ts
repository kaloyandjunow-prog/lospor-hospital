import { describe, expect, it } from "vitest"
import type { LogEvent } from "./intraop-log-event"
import {
  autoFillVitalKeys,
  buildAutoFilledVitalEvent,
  latestVitalColumn,
  latestVitalEvent,
  previousVitalAfterIndex,
  timetableColumnForTimestamp,
  vitalFieldVisibility,
} from "./intraop-vital-log"

const ev = (event: Partial<LogEvent>): LogEvent => event as LogEvent

describe("intraop vital log helpers", () => {
  it("finds the latest vital in a newest-first log", () => {
    const latest = ev({ id: "latest", type: "vital", heartRate: 80 })
    const older = ev({ id: "older", type: "vital", heartRate: 70 })
    expect(latestVitalEvent([
      ev({ id: "drug", type: "drug" }),
      latest,
      older,
    ])).toBe(latest)
  })

  it("finds the previous vital after a log index", () => {
    const previous = ev({ id: "previous", type: "vital", heartRate: 70 })
    expect(previousVitalAfterIndex([
      ev({ id: "current", type: "vital", heartRate: 80 }),
      ev({ id: "drug", type: "drug" }),
      previous,
    ], 0)).toBe(previous)
  })

  it("returns undefined when no vital exists", () => {
    expect(latestVitalEvent([ev({ type: "drug" })])).toBeUndefined()
    expect(previousVitalAfterIndex([ev({ type: "vital" })], 0)).toBeUndefined()
  })

  it("selects the vital keys to auto-fill", () => {
    expect(autoFillVitalKeys(false)).toEqual(["etco2", "temp", "spO2"])
    expect(autoFillVitalKeys(true)).toEqual(["etco2", "temp", "spO2", "systolic", "diastolic", "heartRate"])
  })

  it("maps timestamps to clamped 5-minute timetable columns", () => {
    const chartStart = new Date("2026-07-01T10:00:00.000Z")
    expect(timetableColumnForTimestamp(chartStart, new Date("2026-07-01T10:14:59.000Z").getTime())).toBe(2)
    expect(timetableColumnForTimestamp(chartStart, new Date("2026-07-01T09:55:00.000Z").getTime())).toBe(0)
  })

  it("finds the latest vital column or null when no vitals exist", () => {
    const chartStart = new Date("2026-07-01T10:00:00.000Z")
    expect(latestVitalColumn([
      ev({ type: "vital", ts: "2026-07-01T10:05:00.000Z" }),
      ev({ type: "drug", ts: "2026-07-01T10:20:00.000Z" }),
      ev({ type: "vital", ts: "2026-07-01T10:15:00.000Z" }),
    ], chartStart)).toBe(3)
    expect(latestVitalColumn([ev({ type: "drug", ts: "2026-07-01T10:20:00.000Z" })], chartStart)).toBeNull()
  })

  it("builds copied auto-fill vital payloads only from numeric source values", () => {
    expect(buildAutoFilledVitalEvent(ev({
      type: "vital",
      etco2: 35,
      spO2: 98,
      temp: 36.6,
      systolic: 120,
      diastolic: 70,
      heartRate: 80,
      bgl: 100,
    }), false)).toEqual({
      type: "vital",
      etco2: 35,
      temp: 36.6,
      spO2: 98,
    })

    expect(buildAutoFilledVitalEvent(ev({
      type: "vital",
      etco2: 35,
      systolic: 120,
      diastolic: 70,
      heartRate: 80,
    }), true)).toEqual({
      type: "vital",
      etco2: 35,
      systolic: 120,
      diastolic: 70,
      heartRate: 80,
    })

    expect(buildAutoFilledVitalEvent(ev({ type: "vital" }), true)).toBeNull()
  })

  it("derives vital field visibility from case type and monitoring labels", () => {
    expect(vitalFieldVisibility(true, [])).toEqual({
      showEtco2: true,
      showTemperature: true,
      showGlucose: false,
    })
    expect(vitalFieldVisibility(false, ["EtCO2", "Temperature", "blood glucose"])).toEqual({
      showEtco2: true,
      showTemperature: true,
      showGlucose: true,
    })
    expect(vitalFieldVisibility(false, [])).toEqual({
      showEtco2: false,
      showTemperature: false,
      showGlucose: false,
    })
  })
})
