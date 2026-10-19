import { describe, expect, it } from "vitest"
import {
  isPerKgVolumeRate,
  milligramsPerMillilitre,
  volumeRateFromPump,
  volumeRateReadout,
  volumeRateSurface,
} from "./volume-dose"

describe("volume-rate local anaesthetic infusions", () => {
  it("reads strengths as mg/mL", () => {
    expect(milligramsPerMillilitre("0.2%")).toBe(2)
    expect(milligramsPerMillilitre("0,125%")).toBe(1.25)
    expect(milligramsPerMillilitre("5 mg/mL")).toBe(5)
    expect(milligramsPerMillilitre("custom")).toBeNull()
  })

  it("keeps the dose under the limit whatever the strength", () => {
    const limit = { unit: "mg/kg/hr", max: 0.4, suggested: 0.3 }
    const base = { max: 1, step: 0.01, quickValues: [0.1, 0.15, 0.2, 0.3, 0.4] }
    expect(volumeRateSurface({ ...base, doseLimit: limit, concentration: "0.2%" }))
      .toEqual({ max: 0.2, quickValues: [0.1, 0.15, 0.2], suggestedRate: 0.15 })
    expect(volumeRateSurface({ ...base, doseLimit: limit, concentration: "0.1%" }))
      .toEqual({ max: 0.4, quickValues: [0.1, 0.15, 0.2, 0.3, 0.4], suggestedRate: 0.3 })
    // A strength that cannot be read leaves the authored surface.
    expect(volumeRateSurface({ ...base, doseLimit: limit, concentration: undefined }).max).toBe(1)
  })

  it("shows the pump rate and the dose for a child", () => {
    expect(volumeRateReadout({ rate: 0.2, unit: "mL/kg/hr", concentration: "0.2%", weightKg: 12 }))
      .toEqual({ pumpMlPerHour: 2.4, doseRate: { value: 0.4, unit: "mg/kg/hr" } })
    expect(volumeRateReadout({ rate: 0.2, unit: "mL/kg/hr", concentration: "0.2%", weightKg: null }).pumpMlPerHour).toBeNull()
    expect(volumeRateReadout({ rate: 8, unit: "mL/hr", concentration: "0.2%" }))
      .toEqual({ pumpMlPerHour: 8, doseRate: { value: 16, unit: "mg/hr" } })
  })

  it("turns a pump rate back into mL/kg/hr without moving it", () => {
    const rate = volumeRateFromPump(2.5, 12)
    expect(rate).toBe(0.208)
    expect(volumeRateReadout({ rate: rate!, unit: "mL/kg/hr", weightKg: 12 }).pumpMlPerHour).toBe(2.5)
    expect(volumeRateFromPump(2.5, null)).toBeNull()
    expect(isPerKgVolumeRate("mL/kg/hr")).toBe(true)
    expect(isPerKgVolumeRate("mL/hr")).toBe(false)
  })
})
