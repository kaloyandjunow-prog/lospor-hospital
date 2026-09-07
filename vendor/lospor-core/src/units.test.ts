
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
    // mmHg, not the cmH2O default: this fixture is the all-canonical one, and
    // CVP is the single measurement whose default display is its alternate.
    cvpUnit: "mmHg",
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

/**
 * CVP is the one measurement whose alternate unit is what a clinician sees by
 * default, because the transducers here are scaled in cmH2O. That inversion is
 * easy to read backwards, so it is pinned: the record is mmHg either way.
 */
describe("central venous pressure converts for display only", () => {
  const cmH2O: UnitPreferences = {
    heightUnit: "cm", weightUnit: "kg", temperatureUnit: "C", etco2Unit: "mmHg",
    cvpUnit: "cmH2O",
  }
  const mmHg: UnitPreferences = { ...cmH2O, cvpUnit: "mmHg" }

  it("shows a stored mmHg pressure in cmH2O by default", () => {
    const shown = measurementDisplayValues("cvp", cmH2O, 7.4, 0.1, 50, 0.1)
    expect(shown.value).toBe(10.1)
    expect(shown.unit).toBe("cmH₂O")
    // The bounds travel with the value, so the control cannot offer a pressure
    // the column would reject.
    expect(shown.max).toBe(68)
  })

  it("leaves the pressure alone when mmHg is chosen", () => {
    const shown = measurementDisplayValues("cvp", mmHg, 7.4, 0.1, 50, 0.1)
    expect(shown.value).toBe(7.4)
    expect(shown.unit).toBe("mmHg")
    expect(shown.max).toBe(50)
  })

  it("returns what was typed back to mmHg", () => {
    const shown = measurementDisplayValues("cvp", cmH2O, undefined, 0.1, 50, 0.1)
    expect(shown.toCanonical(10.1)).toBe(7.4)
    // A cleared field stays cleared: converting undefined would produce NaN and
    // record a pressure nobody measured.
    expect(shown.toCanonical(undefined)).toBeUndefined()
  })
})
