import { describe, expect, it } from "vitest"
import { customStrength, customStrengthField, customStrengthLabel, formatStrength, strengthValue } from "./strength-entry"

describe("customStrengthField", () => {
  it("gives a named local anaesthetic its clinical range, with its strengths as pills", () => {
    expect(customStrengthField({ name: "Ropivacaine", unit: "PERCENT", options: ["0.1%", "0.2%", "0.5%", "0.75%", "1%"] }))
      .toEqual({ unit: "%", min: 0.05, max: 1, step: 0.025, quickValues: [0.1, 0.2, 0.5, 0.75, 1], prefill: 0.5 })
    expect(customStrengthField({ name: "Levobupivacaine", unit: "%", options: ["0.0625%", "0.125%", "0.25%"] }))
      .toMatchObject({ min: 0.05, max: 0.75, quickValues: [0.0625, 0.125, 0.25], prefill: 0.125 })
  })

  it("covers the fluids sold in %", () => {
    expect(customStrengthField({ name: "Sodium chloride", unit: "%", options: ["0.9%", "3%"] })).toMatchObject({ min: 0.45, max: 23.4 })
    expect(customStrengthField({ name: "Glucose", unit: "%", options: ["5%", "10%"] })).toMatchObject({ min: 1, max: 50 })
  })

  it("draws any other drug's range from its own strengths, on a step every pill lands on", () => {
    expect(customStrengthField({ name: "Atropine", unit: "MG_PER_ML", options: ["0.1 mg/mL", "0.6 mg/mL", "1 mg/mL"] }))
      .toEqual({ unit: "mg/mL", min: 0.05, max: 2, step: 0.01, quickValues: [0.1, 0.6, 1], prefill: 0.6 })
    expect(customStrengthField({ name: "Alfentanil", unit: "MCG_PER_ML", options: ["500 mcg/mL"] }))
      .toMatchObject({ unit: "mcg/mL", min: 250, max: 1000, prefill: 500 })
  })

  it("falls back to the unit's span, and to nothing for a unit it cannot place", () => {
    expect(customStrengthField({ unit: "%" })).toMatchObject({ min: 0.05, max: 20, quickValues: [0.5, 1, 2, 5], prefill: 1 })
    expect(customStrengthField({ unit: "furlongs" })).toBeNull()
    expect(customStrengthField({ name: "Ropivacaine", options: ["0.2%", "0.5%"] })).toMatchObject({ unit: "%", max: 1 })
    expect(customStrengthField({ options: ["2 mg/mL"] })).toMatchObject({ unit: "mg/mL" })
    expect(customStrengthField({})).toBeNull()
  })
})

describe("customStrength", () => {
  const ropivacaine = customStrengthField({ name: "Ropivacaine", unit: "%", options: ["0.2%"] })!
  it("labels a strength in range as the pills are", () => {
    expect(customStrength(ropivacaine, "0.15")).toEqual({ value: 0.15, label: "0.15%" })
    expect(customStrength(ropivacaine, "0,15")).toEqual({ value: 0.15, label: "0.15%" })
    expect(customStrength(customStrengthField({ unit: "mg/mL", options: ["2 mg/mL"] })!, 3)).toEqual({ value: 3, label: "3 mg/mL" })
  })
  it("says why it refuses", () => {
    for (const text of ["", " ", "abc", null, undefined]) expect(customStrength(ropivacaine, text)).toEqual({ error: "empty" })
    expect(customStrength(ropivacaine, "2")).toEqual({ error: "range" })
    expect(customStrength(ropivacaine, "0.01")).toEqual({ error: "range" })
  })
})

describe("strength labels", () => {
  it("reads and writes them", () => {
    expect(strengthValue("0.2%")).toBe(0.2)
    expect(strengthValue("2 mg/mL")).toBe(2)
    expect(strengthValue("Other")).toBeNull()
    expect(formatStrength(0.5, "%")).toBe("0.5%")
    expect(formatStrength(10, "mg/mL")).toBe("10 mg/mL")
    expect(customStrengthLabel("0.15", "PERCENT")).toBe("0.15%")
    expect(customStrengthLabel("2", "MG_PER_ML")).toBe("2 mg/mL")
    expect(customStrengthLabel("2", undefined)).toBe("2")
    expect(customStrengthLabel("", "PERCENT")).toBeUndefined()
  })
})
