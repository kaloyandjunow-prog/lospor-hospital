import { describe, expect, it } from "vitest"
import { FIO2, FRESH_GAS_FLOW, GAS_QUICK_VALUES, gasQuickValues } from "./gas-ranges"

describe("gas quick values", () => {
  it("offers them to an adult with guidance on", () => {
    expect(gasQuickValues({ guidance: true, paediatric: false })).toEqual({ freshGasFlow: [0.5, 1, 2, 4, 6], fio2: [30, 40, 50, 80, 100] })
  })

  it("offers none for a child or with guidance off", () => {
    for (const options of [{ guidance: true, paediatric: true }, { guidance: false, paediatric: false }, { guidance: false, paediatric: true }]) {
      expect(gasQuickValues(options)).toEqual({ freshGasFlow: [], fio2: [] })
    }
  })

  it("keeps every quick value inside the range of its control", () => {
    for (const flow of GAS_QUICK_VALUES.freshGasFlow) {
      expect(flow).toBeGreaterThanOrEqual(FRESH_GAS_FLOW.min)
      expect(flow).toBeLessThanOrEqual(FRESH_GAS_FLOW.sliderMax)
    }
    for (const fio2 of GAS_QUICK_VALUES.fio2) {
      expect(fio2).toBeGreaterThanOrEqual(FIO2.min)
      expect(fio2).toBeLessThanOrEqual(FIO2.max)
    }
  })
})
