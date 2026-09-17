import { describe, expect, it } from "vitest"

import type { LogEvent } from "@/lib/intraop-log-event"
import {
  buildVitalEntry,
  parseVitalEntryNumber,
  replaceVitalEvent,
  vitalEntryFeedback,
  type VitalEntryInput,
} from "@/lib/intraop-vital-entry"

const emptyInput = (): VitalEntryInput => ({
  systolic: "",
  diastolic: "",
  heartRate: "",
  spO2: "",
  etco2: "",
  temp: "",
  bis: "",
  tofRatio: "",
  cvp: "",
})

const identityConversions = { etco2: Number, temp: Number, cvp: Number }

describe("intraoperative vital entry", () => {
  it("parses the whole field and accepts decimal commas", () => {
    expect(parseVitalEntryNumber(" 0,5 ")).toBe(0.5)
    expect(parseVitalEntryNumber("12x")).toBeNaN()
    expect(parseVitalEntryNumber(" ")).toBeUndefined()
  })

  it("blocks device-scale violations while retaining boundary values", () => {
    const valid = buildVitalEntry({ ...emptyInput(), bis: "0", tofRatio: "1", spO2: "100" }, identityConversions)
    expect(vitalEntryFeedback(valid).hasHardErrors).toBe(false)

    const invalid = buildVitalEntry({ ...emptyInput(), bis: "100.5", tofRatio: "1.1", spO2: "101" }, identityConversions)
    expect(vitalEntryFeedback(invalid).errors).toMatchObject({
      bis: "not_integer",
      tofRatio: "above_max",
      spO2: "above_max",
    })
  })

  it("warns without blocking chartable clinical extremes", () => {
    const vital = buildVitalEntry({
      ...emptyInput(), systolic: "301", diastolic: "151", heartRate: "39", temp: "42",
    }, identityConversions)
    const feedback = vitalEntryFeedback(vital)
    expect(feedback.hasHardErrors).toBe(false)
    expect(feedback.warnings).toMatchObject({
      systolic: "high", diastolic: "high", heartRate: "low", temp: "high",
    })
  })

  it("edits the same logical event ID and leaves no removed dependent event", () => {
    const original = { id: "vital-1", ts: "2026-09-15T08:00:00.000Z", type: "vital", bis: 50 } as LogEvent
    const other = { id: "drug-1", ts: "2026-09-15T08:01:00.000Z", type: "drug" } as LogEvent
    const edited = replaceVitalEvent([other, original], original.id, { type: "vital", bis: 60 }, "fallback")

    expect(edited.event).toMatchObject({ id: original.id, ts: original.ts, bis: 60 })
    expect(edited.log.map(event => event.id)).toEqual([other.id, original.id])
    expect(edited.log.filter(event => event.id === original.id)).toHaveLength(1)
  })
})
