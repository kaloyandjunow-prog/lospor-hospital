import { describe, expect, it } from "vitest"
import {
  buildSummaryTimetableModel,
  colToHHMM,
} from "./summary-timetable"

describe("summary timetable model", () => {
  it("uses the canonical column interval for wall-clock labels", () => {
    expect(colToHHMM(3, "2000-01-01T23:50:00.000Z")).toBe("00:05")
    expect(colToHHMM(3)).toBe("+15m")
  })

  it("builds all semantic lanes, including consecutive gas changes", () => {
    const model = buildSummaryTimetableModel({
      vitals: [{ systolic: 120 }, { systolic: 118 }],
      gasSettings: [
        { startCol: 0, endCol: 0, fgf: 10, carrierGas: "O2", fio2: 100 },
        { startCol: 1, endCol: 3, fgf: 1, carrierGas: "AIR", fio2: 50 },
      ],
      agents: [{ startCol: 0, endCol: 3, name: "Sevoflurane", percent: 2 }],
      fluids: [{ startCol: 1, endCol: 2, name: "Plasma-Lyte", volume: "500" }],
    })
    const gas = model.lanes.find(lane => lane.label === "Gas")
    expect(gas?.segments).toHaveLength(2)
    expect(gas?.segments[0]).toMatchObject({ code: "o2" })
    expect(gas?.segments[0]?.text).not.toContain("Air")
    expect(gas?.segments[1]).toMatchObject({ code: "air" })
    expect(gas?.segments[1]?.text).toContain("1 L/min")
    expect(model.hasData).toBe(true)
  })
})
