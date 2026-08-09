import { describe, expect, it } from "vitest"

import { calculateFluidTotals, fluidTotalsPatch } from "./intraop-totals"

describe("canonical fluid totals", () => {
  it("uses projected final volumes and keeps database totals integer-safe", () => {
    const totals = calculateFluidTotals([
      { id: "a", volume: "12.6", category: "Crystalloids", startCol: 0 },
      { id: "b", volume: "7.4", category: "Crystalloids", startCol: 1 },
      { id: "c", volume: "99.5", category: "Blood products", startCol: 2 },
      { id: "invalid", volume: "-10", category: "Colloids", startCol: 3 },
    ])
    expect(totals).toEqual({ crystalloids: 20, colloids: 0, blood: 100 })
    expect(fluidTotalsPatch(totals)).toEqual({
      crystalloidsMl: 20,
      colloidsMl: null,
      bloodMl: 100,
    })
  })
})
