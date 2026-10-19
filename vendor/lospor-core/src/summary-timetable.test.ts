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

  it("gives each infusion, agent and fluid its own row, so ones running together do not hide each other", () => {
    const model = buildSummaryTimetableModel({
      infusions: [
        { startCol: 1, endCol: 9, name: "Propofol", rate: 4, unit: "mcg/mL", tciModel: "SCHNIDER", tciSite: "EFFECT" },
        { startCol: 1, endCol: 12, name: "Remifentanil", rate: 0.15, unit: "mcg/kg/min" },
      ],
      fluids: [{ startCol: 0, endCol: 5, name: "Ringer", volume: "500" }, { startCol: 2, endCol: 6, name: "Gelofusine", volume: "500" }],
      gasSettings: [{ startCol: 0, endCol: 1, fgf: 2 }, { startCol: 2, endCol: 9, fgf: 1 }],
    })
    const rows = (kind: string) => model.lanes.filter(lane => lane.kind === kind)
    expect(rows("infusion").map(lane => lane.segments.map(segment => segment.text))).toEqual([
      ["Propofol Ce 4 mcg/mL · Schnider"], ["Remifentanil 0.15 mcg/kg/min"],
    ])
    expect(rows("fluid").map(lane => lane.segments[0]!.code)).toEqual(["Ringer", "Gelofusine"])
    expect(rows("gas")).toHaveLength(1)
    expect(rows("gas")[0]!.segments).toHaveLength(2)
  })
})
