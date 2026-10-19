import { describe, expect, it } from "vitest"
import {
  convertInfusionEntry,
  doseConfirmProblem,
  infusionConfirmProblem,
  infusionEntrySurface,
  infusionEntryUnits,
  infusionReadout,
  infusionRecord,
  infusionEntryWeightKg,
  switchInfusionEntry,
} from "./infusion-entry"

// The infusion entry both apps share (2026-10-18). Noradrenaline 0.1
// mcg/kg/min for 70 kg from 4 mg/50 mL is 5.25 mL/hr throughout.
const noradrenaline = {
  unit: "mcg/kg/min",
  min: 0,
  max: 3,
  step: 0.01,
  quickValues: [0.02, 0.05, 0.1],
  concentration: "4 mg/50 mL",
  weightKg: 70,
}

describe("the units offered", () => {
  it("are the rule's unit, the other dose unit, and the pump rate", () => {
    expect(infusionEntryUnits(noradrenaline)).toEqual(["mcg/kg/min", "mcg/min", "mL/hr"])
    expect(infusionEntryUnits({ unit: "mg/hr", weightKg: 80 })).toEqual(["mg/hr", "mg/kg/hr", "mL/hr"])
  })

  it("leave out the per-kg unit when there is no weight, but always offer mL/hr", () => {
    expect(infusionEntryUnits({ unit: "mcg/kg/min", weightKg: null })).toEqual(["mcg/kg/min", "mL/hr"])
    expect(infusionEntryUnits({ unit: "IU/hr", weightKg: null })).toEqual(["IU/hr", "mL/hr"])
  })

  it("for a child's local anaesthetic are its volume rate and the pump rate", () => {
    expect(infusionEntryUnits({ unit: "mL/kg/hr", weightKg: 12 })).toEqual(["mL/kg/hr", "mL/hr"])
    expect(infusionEntryUnits({ unit: "mL/hr", weightKg: 70 })).toEqual(["mL/hr"])
  })
})

describe("switching unit", () => {
  it("carries the value across", () => {
    expect(convertInfusionEntry({ ...noradrenaline, value: 0.1, from: "mcg/kg/min", to: "mL/hr" })).toBe(5.25)
    expect(convertInfusionEntry({ ...noradrenaline, value: 5.25, from: "mL/hr", to: "mcg/kg/min" })).toBe(0.1)
    expect(convertInfusionEntry({ ...noradrenaline, value: 0.1, from: "mcg/kg/min", to: "mcg/min" })).toBe(7)
    expect(convertInfusionEntry({ unit: "mL/kg/hr", min: 0, max: 1, step: 0.01, weightKg: 12, value: 0.2, from: "mL/kg/hr", to: "mL/hr" })).toBe(2.4)
  })

  it("clears it when it cannot: no strength for mL/hr", () => {
    expect(convertInfusionEntry({ ...noradrenaline, concentration: undefined, value: 0.1, from: "mcg/kg/min", to: "mL/hr" })).toBeNull()
  })
})

describe("the slider for each unit", () => {
  it("keeps the rule's range and pills in the rule's unit", () => {
    expect(infusionEntrySurface({ ...noradrenaline, entryUnit: "mcg/kg/min" })).toEqual({ min: 0, max: 3, step: 0.01, quickValues: [0.02, 0.05, 0.1] })
  })

  it("carries the same maximum into another unit, without pills", () => {
    // 3 mcg/kg/min for 70 kg = 157.5 mL/hr of 4 mg/50 mL; 210 mcg/min.
    expect(infusionEntrySurface({ ...noradrenaline, entryUnit: "mL/hr" })).toEqual({ min: 0, max: 157.5, step: 0.1 })
    expect(infusionEntrySurface({ ...noradrenaline, entryUnit: "mcg/min" })).toMatchObject({ min: 0, max: 210, step: 0.5 })
  })

  it("follows the strength for a dose-limited local anaesthetic", () => {
    const ropivacaine = { unit: "mL/kg/hr", min: 0, max: 0.5, step: 0.01, quickValues: [0.1, 0.2, 0.3], doseLimit: { unit: "mg/kg/hr", max: 0.4, suggested: 0.3 }, weightKg: 12 }
    expect(infusionEntrySurface({ ...ropivacaine, concentration: "0.2%", entryUnit: "mL/kg/hr" })).toEqual({ min: 0, max: 0.2, step: 0.01, quickValues: [0.1, 0.2], suggestedRate: 0.15 })
    expect(infusionEntrySurface({ ...ropivacaine, concentration: "0.2%", entryUnit: "mL/hr" })).toEqual({ min: 0, max: 2.4, step: 0.1 })
  })
})

describe("what is recorded: both rates", () => {
  it("a dose rate with its pump rate and weight", () => {
    expect(infusionRecord({ ...noradrenaline, value: 0.1, entryUnit: "mcg/kg/min" }))
      .toEqual({ rate: 0.1, unit: "mcg/kg/min", volumeRateMlPerHour: 5.25, calculationWeightKg: 70 })
  })

  it("a pump rate as the dose rate in the dose unit, beside the pump rate", () => {
    expect(infusionRecord({ ...noradrenaline, value: 5.25, entryUnit: "mL/hr" }))
      .toEqual({ rate: 0.1, unit: "mcg/kg/min", volumeRateMlPerHour: 5.25, calculationWeightKg: 70 })
    expect(infusionRecord({ ...noradrenaline, value: 5.25, entryUnit: "mL/hr", doseUnit: "mcg/min" }))
      .toEqual({ rate: 7, unit: "mcg/min", volumeRateMlPerHour: 5.25 })
  })

  it("with the syringe skipped: the dose rate alone, or a mL/hr entry as a volume rate", () => {
    expect(infusionRecord({ ...noradrenaline, concentration: undefined, value: 0.1, entryUnit: "mcg/kg/min" }))
      .toEqual({ rate: 0.1, unit: "mcg/kg/min", calculationWeightKg: 70 })
    expect(infusionRecord({ ...noradrenaline, concentration: undefined, value: 8, entryUnit: "mL/hr" }))
      .toEqual({ rate: 8, unit: "mL/hr", volumeRateMlPerHour: 8 })
  })

  it("a child's local anaesthetic volume with its pump rate", () => {
    expect(infusionRecord({ unit: "mL/kg/hr", min: 0, max: 0.5, step: 0.01, concentration: "0.2%", weightKg: 12, value: 2.5, entryUnit: "mL/hr" }))
      .toEqual({ rate: 0.208, unit: "mL/kg/hr", volumeRateMlPerHour: 2.5, calculationWeightKg: 12 })
  })

  it("nothing for a value that is not a rate", () => {
    expect(infusionRecord({ ...noradrenaline, value: Number.NaN, entryUnit: "mcg/kg/min" })).toBeNull()
    expect(infusionRecord({ ...noradrenaline, value: -1, entryUnit: "mcg/kg/min" })).toBeNull()
  })
})

describe("the readout beside the box", () => {
  it("shows the pump rate of a dose rate, and the dose rate of a pump rate", () => {
    expect(infusionReadout({ ...noradrenaline, value: 0.1, entryUnit: "mcg/kg/min" })).toEqual({ pumpMlPerHour: 5.25 })
    expect(infusionReadout({ ...noradrenaline, value: 5.25, entryUnit: "mL/hr" })).toEqual({ doseRate: { value: 0.1, unit: "mcg/kg/min" } })
    expect(infusionReadout({ ...noradrenaline, concentration: undefined, value: 0.1, entryUnit: "mcg/kg/min" })).toEqual({})
  })

  it("shows a child's per-kg volume and dose for a pump rate", () => {
    expect(infusionReadout({ unit: "mL/kg/hr", min: 0, max: 0.5, step: 0.01, concentration: "0.2%", weightKg: 12, value: 2.5, entryUnit: "mL/hr" }))
      .toEqual({ volumeRate: { value: 0.208, unit: "mL/kg/hr" }, doseRate: { value: 0.417, unit: "mg/kg/hr" } })
  })

  it("shows a local anaesthetic volume's pump rate and dose", () => {
    expect(infusionReadout({ unit: "mL/kg/hr", min: 0, max: 0.5, step: 0.01, concentration: "0.2%", weightKg: 12, value: 0.2, entryUnit: "mL/kg/hr" }))
      .toEqual({ pumpMlPerHour: 2.4, doseRate: { value: 0.4, unit: "mg/kg/hr" } })
  })
})

describe("the weight per-kg rates use", () => {
  it("follows the infusion's basis, falling back as the totals do", () => {
    expect(infusionEntryWeightKg({ basis: "IBW", idealWeightKg: 64, actualWeightKg: 90 })).toBe(64)
    expect(infusionEntryWeightKg({ basis: "TBW", idealWeightKg: 64, actualWeightKg: 90 })).toBe(90)
    expect(infusionEntryWeightKg({ basis: "IBW", idealWeightKg: null, actualWeightKg: 90 })).toBe(90)
    expect(infusionEntryWeightKg({ basis: "TBW", idealWeightKg: null, actualWeightKg: null })).toBeNull()
  })
})

describe("switching the entry unit", () => {
  it("rounds to the new unit's step, so the box shows what is recorded", () => {
    expect(switchInfusionEntry({ ...noradrenaline, weightKg: 70.5, value: 0.05, from: "mcg/kg/min", to: "mL/hr" })).toBe(2.6)
    expect(switchInfusionEntry({ ...noradrenaline, value: 5.25, from: "mL/hr", to: "mcg/kg/min" })).toBe(0.1)
    expect(switchInfusionEntry({ ...noradrenaline, concentration: undefined, value: 0.1, from: "mcg/kg/min", to: "mL/hr" })).toBeNull()
  })
})

describe("infusionConfirmProblem", () => {
  it("names the first thing missing, so the screen can say it", () => {
    for (const rate of ["", " ", "0", "-1", "abc", 0, null, undefined, Number.NaN]) expect(infusionConfirmProblem({ rate })).toBe("rate")
    expect(infusionConfirmProblem({ rate: "2", strengthMissing: true, formulationMissing: true })).toBe("strength")
    expect(infusionConfirmProblem({ rate: 2, formulationMissing: true })).toBe("formulation")
    expect(infusionConfirmProblem({ rate: "0.05" })).toBeNull()
  })
})

describe("doseConfirmProblem", () => {
  it("names the first thing missing for a bolus", () => {
    expect(doseConfirmProblem({ dose: "" , strengthMissing: true })).toBe("dose")
    expect(doseConfirmProblem({ dose: "5", strengthMissing: true })).toBe("strength")
    expect(doseConfirmProblem({ dose: 5, formulationMissing: true })).toBe("formulation")
    expect(doseConfirmProblem({ dose: "5" })).toBeNull()
  })
})
