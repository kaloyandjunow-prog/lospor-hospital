import { describe, expect, it } from "vitest"
import { convertDoseAmount } from "./dose-units"

describe("a suggestion's dose in the sheet's unit", () => {
  it("converts masses and refuses anything else", () => {
    expect(convertDoseAmount(50, "mcg", "mg")).toBe(0.05)
    expect(convertDoseAmount(1, "g", "mg")).toBe(1000)
    expect(convertDoseAmount(5, "MG", "mcg")).toBe(5000)
    expect(convertDoseAmount(10, "IU", "mg")).toBeNull()
    expect(convertDoseAmount(10, "mL", "mL")).toBe(10)
  })
})
