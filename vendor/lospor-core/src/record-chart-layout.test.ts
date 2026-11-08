import { describe, expect, it } from "vitest"
import { layoutRecordChart, pickTickMinutes } from "./record-chart-layout"
import { buildRecordTimetable } from "./record-timetable"

const kev = {
  vitals: [{ systolic: 120, diastolic: 70, heartRate: 70 }, { systolic: 118, diastolic: 68, heartRate: 72 }],
  drugs: [
    { colIdx: 1, name: "Fentanyl", dose: "100", unit: "mcg" },
    { colIdx: 2, name: "Fentanyl", dose: "100", unit: "mcg" },
    { colIdx: 3, name: "Fentanyl", dose: "100", unit: "mcg" },
  ],
  infusions: [{ id: "i", name: "Remifentanil", rate: 0.1, unit: "mcg/kg/min", startCol: 0, endCol: 20, color: "#000" }],
  clinicalEvents: [{ colIdx: 1, label: "Induction", color: "#000" }],
}
const model = buildRecordTimetable(kev, { startedAt: "2026-11-07T08:00:00.000Z", timezone: "UTC" }, "en")

describe("the record's chart layout", () => {
  const scene = layoutRecordChart(model)

  it("draws a diamond and an amount for each dose when there is room", () => {
    const diamonds = scene.items.filter(i => i.t === "path" && i.fill === "#0369a1")
    expect(diamonds).toHaveLength(3)
    expect(scene.items.filter(i => i.t === "text" && i.text === "100 mcg").length).toBeGreaterThan(0)
  })

  it("moves a crowded dose label to another track instead of printing it over a neighbour", () => {
    const labels = scene.items.filter((i): i is Extract<typeof i, { t: "text" }> => i.t === "text" && i.text === "100 mcg")
    const spots = new Set(labels.map(l => `${Math.round(l.x)}:${Math.round(l.y)}`))
    expect(spots.size).toBe(labels.length)
  })

  it("draws a bar, a name and a time mark for the infusion, and keeps everything inside the width", () => {
    expect(scene.items.some(i => i.t === "rect" && i.fill === "#2563eb")).toBe(true)
    expect(scene.items.some(i => i.t === "text" && i.text === "Remifentanil")).toBe(true)
    expect(scene.items.some(i => i.t === "text" && /^\d\d:\d\d$/.test(i.text))).toBe(true)
    const xs = scene.items.filter(i => i.t === "rect").flatMap(i => [i.x, i.x + i.w])
    expect(Math.max(...xs)).toBeLessThanOrEqual(scene.width)
  })

  it("scales with the width asked for and takes the reader's colours", () => {
    const narrow = layoutRecordChart(model, { width: 480, labelWidth: 82, ink: "#eee", faint: "#333" })
    expect(narrow.width).toBe(480)
    expect(narrow.items.some(i => i.t === "text" && i.fill === "#eee")).toBe(true)
  })

  it("spaces the time marks by the length of the case", () => {
    expect(pickTickMinutes(24)).toBe(30)
    expect(pickTickMinutes(96)).toBe(60)
    expect(pickTickMinutes(200)).toBe(120)
  })

  it("lays out an empty chart without failing", () => {
    expect(layoutRecordChart(buildRecordTimetable(null, {}, "en")).items.length).toBeGreaterThan(0)
  })
})
