import { describe, expect, it } from "vitest"
import type { TimetableData, TimetableFluid } from "@/components/IntraopTimetable"
import {
  calculateFluidTotals,
  fluidTotalsKey,
  fluidTotalsPatch,
  newChartFluidsWithTimestamps,
} from "./intraop-chart-change"

const emptyData = (): TimetableData => ({
  vitals: [],
  drugs: [],
  fluids: [],
  infusions: [],
  agents: [],
  gasSettings: [],
})

const fluid = (id: string, startCol: number): TimetableFluid => ({
  id,
  name: `Fluid ${id}`,
  category: "Crystalloid",
  volume: "500",
  color: "#06b6d4",
  startCol,
  endCol: startCol + 6,
})

describe("newChartFluidsWithTimestamps", () => {
  it("returns only fluids missing from the previous timetable", () => {
    const start = new Date("2026-01-01T08:00:00.000Z")
    const previous = { ...emptyData(), fluids: [fluid("existing", 1)] }
    const next = { ...emptyData(), fluids: [fluid("existing", 1), fluid("new", 3)] }

    expect(newChartFluidsWithTimestamps(previous, next, start)).toEqual([
      { fluid: fluid("new", 3), ts: "2026-01-01T08:15:00.000Z" },
    ])
  })

  it("returns an empty list when no fluids were added", () => {
    const start = new Date("2026-01-01T08:00:00.000Z")
    const previous = { ...emptyData(), fluids: [fluid("same", 2)] }
    const next = { ...emptyData(), fluids: [fluid("same", 2)] }

    expect(newChartFluidsWithTimestamps(previous, next, start)).toEqual([])
  })
})

describe("fluid total helpers", () => {
  const totalFluid = (category: string, volume: string): TimetableFluid => ({
    id: `${category}-${volume}`,
    name: category,
    category,
    volume,
    color: "#fff",
    startCol: 0,
    endCol: 1,
  })

  it("sums fluid volumes by canonical category", () => {
    expect(calculateFluidTotals([
      totalFluid("Crystalloids", "500"),
      totalFluid("Crystalloids", "250.5"),
      totalFluid("Colloids", "100"),
      totalFluid("Blood products", "300"),
      totalFluid("Other", "999"),
      totalFluid("Crystalloids", ""),
    ])).toEqual({
      crystalloids: 750.5,
      colloids: 100,
      blood: 300,
    })
  })

  it("builds stable keys and nullable API patches", () => {
    const totals = { crystalloids: 500, colloids: 0, blood: 200 }
    expect(fluidTotalsKey(totals)).toBe("500|0|200")
    expect(fluidTotalsPatch(totals)).toEqual({
      crystalloidsMl: 500,
      colloidsMl: null,
      bloodMl: 200,
    })
  })
})
