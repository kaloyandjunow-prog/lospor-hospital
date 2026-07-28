import { describe, expect, it } from "vitest"
import {
  celsiusToFahrenheit,
  cmToInches,
  fahrenheitToCelsius,
  inchesToCm,
  kgToLb,
  kPaToMmHg,
  lbToKg,
  mmHgToKPa,
} from "./unit-conversion"

describe("unit conversion", () => {
  it("round-trips temperature", () => {
    expect(celsiusToFahrenheit(37)).toBeCloseTo(98.6)
    expect(fahrenheitToCelsius(98.6)).toBeCloseTo(37)
  })

  it("round-trips pressure", () => {
    expect(kPaToMmHg(mmHgToKPa(45))).toBeCloseTo(45)
  })

  it("round-trips height and weight", () => {
    expect(inchesToCm(cmToInches(180))).toBeCloseTo(180)
    expect(lbToKg(kgToLb(80))).toBeCloseTo(80)
  })
})
