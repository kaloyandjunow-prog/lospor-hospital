
import { describe, expect, it } from "vitest"
import {
  measurementDisplayValues,
  precisionForStep,
  type UnitPreferences,
} from "./units"

/**
 * A paediatric weight wheel is built from a 0.1 kg step. The canonical-unit
 * branch returned precision 0 regardless, so the wheel rendered every tenth
 * through Math.round: 1.0 to 1.4 all printed "1", 1.5 to 2.4 all printed "2".
 * Every value on the wheel was distinct and correct; only the labels collapsed,
 * which is worse than an obvious failure — it reads as a broken control.
 */
describe("display precision follows the step", () => {
  const metric: UnitPreferences = {
    heightUnit: "cm", weightUnit: "kg", temperatureUnit: "C", etco2Unit: "mmHg",
  }

  it("counts the decimals a step needs", () => {
    expect(precisionForStep(1)).toBe(0)
    expect(precisionForStep(0.5)).toBe(1)
    expect(precisionForStep(0.1)).toBe(1)
    expect(precisionForStep(0.05)).toBe(2)
    expect(precisionForStep(0.001)).toBe(3)
  })

  it("refuses to invent precision from a nonsense step", () => {
    expect(precisionForStep(0)).toBe(0)
    expect(precisionForStep(-1)).toBe(0)
    expect(precisionForStep(Number.NaN)).toBe(0)
    // Nothing clinical is recorded below thousandths.
    expect(precisionForStep(0.0000001)).toBeLessThanOrEqual(3)
  })

  it("gives a paediatric weight step one decimal", () => {
    expect(measurementDisplayValues("weight", metric, undefined, 0.1, 250, 0.1).precision).toBe(1)
  })

  it("leaves a whole-kilogram adult weight at none", () => {
    expect(measurementDisplayValues("weight", metric, undefined, 0.5, 250, 1).precision).toBe(0)
  })

  it("does not disturb the converted-unit path, which has its own precision", () => {
    const imperial: UnitPreferences = { ...metric, weightUnit: "lb" }
    const display = measurementDisplayValues("weight", imperial, 10, 0.1, 250, 0.1)
    expect(display.unit).toBe("lb")
    expect(display.precision).toBe(1)
  })
})
