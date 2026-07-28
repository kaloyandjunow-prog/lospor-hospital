import { describe, it, expect } from "vitest"
import { buildSummaryTimetableModel, buildDrugLogEntries, stepForColW, clampColW, MIN_COL_W, MAX_COL_W } from "./summary-timetable-model"

const blob = {
  vitals: [{ systolic: 120, diastolic: 80, heartRate: 70, spO2: 99 }, { systolic: 110, diastolic: 70, heartRate: 68, spO2: 100 }],
  drugs: [{ colIdx: 1, name: "Propofol", dose: "150", unit: "mg" }],
  agents: [{ name: "Sevoflurane", startCol: 2, endCol: 16, percent: 2 }],
  infusions: [{ id: "i1", name: "Remifentanil", rate: 0.15, unit: "µg/kg/min", startCol: 2, endCol: 17 }],
  gasSettings: [{ id: "g1", startCol: 2, endCol: 19, fgf: 1, carrierGas: "air", fio2: 45 }],
  fluids: [{ id: "f1", name: "Ringer's", volume: "1000", startCol: 3, endCol: 19 }],
  clinicalEvents: [{ colIdx: 1, label: "Induction" }, { colIdx: 19, label: "Extubation" }],
  positions: [{ position: "Supine", startCol: 0, endCol: 3 }, { position: "Prone", startCol: 3, endCol: 20 }],
  log: [{ id: "x", ts: "2026-03-17T08:15:00.000Z", type: "drug" }],
}

describe("buildSummaryTimetableModel", () => {
  it("normalizes the projected web blob into lanes/events/ticks", () => {
    const m = buildSummaryTimetableModel(blob)
    expect(m.hasData).toBe(true)
    expect(m.nCols).toBeGreaterThanOrEqual(21)
    expect(m.events).toEqual([{ col: 1, label: "Induction" }, { col: 19, label: "Extubation" }])
    expect(m.drugTicks).toEqual([{ col: 1, name: "Propofol", n: 1 }])
    const labels = m.lanes.map(l => l.label)
    expect(labels).toEqual(["Agent", "Inf", "Gas", "Fluid", "Pos"])
    const pos = m.lanes.find(l => l.label === "Pos")!
    expect(pos.segments).toEqual([
      { startCol: 0, endCol: 3, text: "Supine", code: "Supine" },
      { startCol: 3, endCol: 20, text: "Prone", code: "Prone" },
    ])
    const gas = m.lanes.find(l => l.label === "Gas")!
    expect(gas.segments[0].text).toContain("FGF 1")
    expect(gas.segments[0].text).toContain("FiO₂ 45%")
  })

  it("degrades gracefully on legacy/empty blobs", () => {
    expect(buildSummaryTimetableModel(undefined).hasData).toBe(false)
    expect(buildSummaryTimetableModel({}).hasData).toBe(false)
    expect(buildSummaryTimetableModel({ log: [] }).hasData).toBe(false)
    expect(buildSummaryTimetableModel([1, 2, 3]).hasData).toBe(false)
    // Blob with only positions (no charted data) is still "no data" for the card
    expect(buildSummaryTimetableModel({ positions: [{ position: "Supine", startCol: 0, endCol: 5 }] }).hasData).toBe(false)
  })
})

describe("semantic zoom helpers", () => {
  it("maps column width to the finest legible sampling step", () => {
    expect(stepForColW(44)).toBe(1)  // max zoom-in → q5
    expect(stepForColW(40)).toBe(1)
    expect(stepForColW(22)).toBe(2)  // q10
    expect(stepForColW(14)).toBe(3)  // q15 — the printed long-case look
    expect(stepForColW(10)).toBe(4)  // q20
    expect(stepForColW(7)).toBe(6)   // q30
    expect(stepForColW(6)).toBe(6)   // even below threshold, coarsest wins
  })

  it("clamps and rounds the zoom range", () => {
    expect(clampColW(100)).toBe(MAX_COL_W)
    expect(clampColW(1)).toBe(MIN_COL_W)
    expect(clampColW(13.6)).toBe(14)
    expect(clampColW(NaN)).toBe(MIN_COL_W)
  })
})

describe("buildDrugLogEntries", () => {
  it("numbers doses in time order with wall-clock times (same as printed log)", () => {
    const entries = buildDrugLogEntries({
      drugs: [
        { colIdx: 4, name: "Fentanyl", dose: "100", unit: "µg" },
        { colIdx: 1, name: "Propofol", dose: "150", unit: "mg" },
      ],
    }, "2026-03-17T08:15:00.000Z")
    expect(entries).toEqual([
      { n: 1, col: 1, time: "08:20", name: "Propofol", dose: "150 mg" },
      { n: 2, col: 4, time: "08:35", name: "Fentanyl", dose: "100 µg" },
    ])
  })

  it("returns [] for empty/invalid blobs and +Xm times without a start", () => {
    expect(buildDrugLogEntries(undefined)).toEqual([])
    expect(buildDrugLogEntries({})).toEqual([])
    const noStart = buildDrugLogEntries({ drugs: [{ colIdx: 2, name: "X", dose: "1", unit: "mg" }] })
    expect(noStart[0].time).toBe("+10m")
  })
})
