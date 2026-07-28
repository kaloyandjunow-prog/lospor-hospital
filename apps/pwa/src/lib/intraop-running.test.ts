import { describe, expect, it } from "vitest"
import { runningItemsAt, runningItemsByCol, vitalSummary, buildRowSummary } from "./intraop-running"
import type { TimetableData } from "@/components/IntraopTimetable"
import type { LogEvent } from "@/lib/intraop-log-event"

const tt = (over: Record<string, unknown>): TimetableData =>
  ({ vitals: [], drugs: [], infusions: [], fluids: [], agents: [], gasSettings: [], ...over } as unknown as TimetableData)

describe("runningItemsAt", () => {
  it("includes an infusion active at the column with the rate in force", () => {
    const t = tt({ infusions: [{ id: "i1", name: "Noradrenaline", rate: "5", color: "#f00", startCol: 0, endCol: 5, rateChanges: [{ col: 2, rate: "8" }] }] })
    expect(runningItemsAt(t, 1)).toEqual([{ id: "inf-i1", label: "Noradrenaline 5", color: "#f00" }])
    expect(runningItemsAt(t, 3)).toEqual([{ id: "inf-i1", label: "Noradrenaline 8", color: "#f00" }]) // after rate change
    expect(runningItemsAt(t, 6)).toEqual([]) // past endCol
  })

  it("includes fluids and agents within their spans", () => {
    const t = tt({
      fluids: [{ id: "f1", name: "Ringer", volume: "1000", color: "#0bf", startCol: 0, endCol: 4 }],
      agents: [{ name: "Sevo", color: "#a5f", startCol: 1, endCol: 3 }],
    })
    expect(runningItemsAt(t, 2)).toEqual(expect.arrayContaining([
      { id: "fluid-f1", label: "Ringer 1000mL", color: "#0bf" },
      { id: "agent-Sevo", label: "Sevo", color: "#a5f" },
    ]))
  })

  it("builds the same running items by column in one pass", () => {
    const t = tt({
      infusions: [{ id: "i1", name: "Noradrenaline", rate: "5", color: "#f00", startCol: 0, endCol: 5, rateChanges: [{ col: 2, rate: "8" }] }],
      fluids: [{ id: "f1", name: "Ringer", volume: "1000", color: "#0bf", startCol: 1, endCol: 3 }],
      agents: [{ name: "Sevo", color: "#a5f", startCol: 2, endCol: 4 }],
    })
    const byCol = runningItemsByCol(t, [1, 2, 4, 6])
    expect(byCol.get(1)).toEqual(runningItemsAt(t, 1))
    expect(byCol.get(2)).toEqual(runningItemsAt(t, 2))
    expect(byCol.get(4)).toEqual(runningItemsAt(t, 4))
    expect(byCol.get(6)).toEqual(runningItemsAt(t, 6))
  })
})

describe("vitalSummary", () => {
  it("summarises present vitals and is empty when none", () => {
    expect(vitalSummary(undefined)).toBe("")
    expect(vitalSummary({ systolic: 120, diastolic: 80, heartRate: 72, spO2: 98 })).toBe("120/80  HR 72  SpO2 98")
  })
})

describe("buildRowSummary", () => {
  const label = (ev: LogEvent) => `${ev.name ?? ev.label}`

  it("routes out-of-range vitals to critical, in-range to normal", () => {
    const s = buildRowSummary({ systolic: 85, heartRate: 140, spO2: 92, temp: 34 }, [], label)
    expect(s.criticalParts).toEqual(["BP 85/?", "HR 140", "SpO2 92", "T 34"])
    expect(s.hasCritical).toBe(true)
    const ok = buildRowSummary({ systolic: 120, diastolic: 80, heartRate: 70, spO2: 98, etco2: 35 }, [], label)
    expect(ok.criticalParts).toEqual([])
    expect(ok.normalParts).toEqual(["120/80", "HR 70", "SpO2 98", "CO2 35"])
    expect(ok.hasCritical).toBe(false)
  })

  it("takes the first four drug/clinical-event labels and flags unsynced", () => {
    const evs = [
      { id: "1", type: "drug", name: "Propofol" },
      { id: "2", type: "clinical_event", label: "Incision" },
      { id: "3", type: "vital" },
      { id: "4", type: "drug", name: "Fentanyl", syncStatus: "failed" },
    ] as unknown as LogEvent[]
    const s = buildRowSummary(undefined, evs, label)
    expect(s.drugParts).toEqual(["Propofol", "Incision", "Fentanyl"])
    expect(s.hasUnsynced).toBe(true)
  })
})
