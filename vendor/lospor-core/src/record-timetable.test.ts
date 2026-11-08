import { describe, expect, it } from "vitest"
import { buildRecordTimetable } from "./record-timetable"

const START = "2026-11-07T08:00:00.000Z"
const kev = {
  vitals: [{ systolic: 120, diastolic: 70, heartRate: 70 }, {}, { systolic: 80, diastolic: 45, heartRate: 90 }],
  drugs: [
    { eventId: "d2", colIdx: 6, name: "Ephedrine", dose: "10", unit: "mg" },
    { eventId: "d1", colIdx: 1, name: "Fentanyl", dose: "100", unit: "mcg" },
    { eventId: "d3", colIdx: 9, name: "Fentanyl", dose: "50", unit: "mcg" },
    { eventId: "dp", colIdx: 20, name: "Planned", dose: "1", unit: "mg", planned: true },
  ],
  infusions: [{ id: "i1", name: "Remifentanil", rate: 0.1, unit: "mcg/kg/min", startCol: 1, endCol: 12, color: "#000", rateChanges: [{ col: 6, rate: 0.2, unit: "mcg/kg/min" }] }],
  agents: [{ name: "Sevoflurane", startCol: 1, endCol: 12, percent: 2, percentChanges: [{ col: 8, percent: 1.5 }] }],
  fluids: [{ id: "f1", name: "Ringer lactate", volume: "500", color: "#000", startCol: 2, endCol: 5 }, { id: "f2", name: "Ringer lactate", volume: "500", color: "#000", startCol: 8, endCol: 11 }],
  clinicalEvents: [{ colIdx: 1, label: "Induction", color: "#000" }, { colIdx: 3, label: "Hypotension", color: "#f00", kind: "complication" }],
  log: [
    { id: "d2", type: "drug", ts: "2026-11-07T08:30:00.000Z", suggestion: "card:Hypotension:ephedrine" },
    { id: "c1", type: "complication", ts: "2026-11-07T08:10:00.000Z", endTs: "2026-11-07T08:25:00.000Z", label: "Hypotension" },
  ],
}

describe("the record's timetable model", () => {
  const model = buildRecordTimetable(kev, { startedAt: START, timezone: "UTC" }, "en")

  it("makes one lane per drug, ordered by first dose, with every dose and the cards marked", () => {
    const bolus = model.lanes.filter(l => l.kind === "bolus")
    expect(bolus.map(l => l.name)).toEqual(["Fentanyl", "Ephedrine"])
    const fentanyl = bolus[0]!
    expect(fentanyl.kind === "bolus" && fentanyl.doses.map(d => [d.col, d.label])).toEqual([[1, "100 mcg"], [9, "50 mcg"]])
    const ephedrine = bolus[1]!
    expect(ephedrine.kind === "bolus" && ephedrine.doses[0]!.card).toBe(true)
  })

  it("leaves a planned dose off the record", () => {
    expect(model.lanes.some(l => l.kind === "bolus" && l.name === "Planned")).toBe(false)
  })

  it("cuts an infusion and an agent where the rate changed", () => {
    const inf = model.lanes.find(l => l.kind === "bars" && l.tone === "infusion")!
    expect(inf.kind === "bars" && inf.bars).toEqual([{ startCol: 1, endCol: 5, label: "0.1 mcg/kg/min" }, { startCol: 6, endCol: 12, label: "0.2" }])
    const agent = model.lanes.find(l => l.kind === "bars" && l.tone === "agent")!
    expect(agent.kind === "bars" && agent.bars.map(b => b.label)).toEqual(["2 %", "1.5 %"])
  })

  it("puts one fluid's bags on one lane", () => {
    const fluid = model.lanes.filter(l => l.kind === "bars" && l.tone === "fluid")
    expect(fluid).toHaveLength(1)
    expect(fluid[0]!.kind === "bars" && fluid[0]!.bars.map(b => b.label)).toEqual(["500 mL", "500 mL"])
  })

  it("reads episodes from the log as bands and keeps complications out of the flags", () => {
    expect(model.episodes).toEqual([{ fromCol: 2, toCol: 5, label: "Hypotension" }])
    expect(model.flags).toEqual([{ col: 1, label: "Induction" }])
  })

  it("keeps the vitals that have a reading and times a column", () => {
    expect(model.vitals.map(v => v.col)).toEqual([0, 2])
    expect(model.time(6)).toBe("08:30")
    expect(model.lastCol).toBeGreaterThanOrEqual(12)
  })

  it("prints column times in the case zone, not UTC", () => {
    expect(buildRecordTimetable(kev, { startedAt: START, timezone: "Europe/Sofia" }, "en").time(6)).toBe("10:30")
  })

  it("names lanes in Bulgarian and survives an empty chart", () => {
    const bg = buildRecordTimetable(kev, { startedAt: START, timezone: "UTC" }, "bg")
    expect(bg.episodes[0]!.label).toBe("Хипотенсия")
    const empty = buildRecordTimetable(null, {}, "en")
    expect(empty.lanes).toEqual([])
    expect(empty.vitals).toEqual([])
  })
})
