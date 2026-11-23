import { describe, expect, it } from "vitest"
import { intraopFluidTotalLabel, intraopInfusionTotalLabel, intraopMinutesLabel, intraopRunTotalLabel } from "./intraop-run-totals"
import type { TimetableData, TimetableFluid, TimetableInfusion } from "./intraop-types"

const at = (m: number) => new Date(Date.UTC(2026, 10, 22, 10, m)).toISOString()
const ctx = { ibw: 70, tbw: 80, now: at(90), language: "en" as const }

// 10.8.0 (rule 5): the total says how much, how long and at what rate -- the same words on the web and the PWA.
describe("run totals", () => {
  it("writes minutes the same in every language", () => {
    expect([30, 60, 75].map(intraopMinutesLabel)).toEqual(["30 min", "1 h", "1 h 15 min"])
  })

  it("a rate fluid: volume, how long, at what rate", () => {
    const fluid = { id: "f", name: "Ringer", volume: "", color: "#0ff", startCol: 0, endCol: 17, stopped: true, fluidEntryMode: "RATE", rate: 500, unit: "mL/h", startTs: at(0), endTs: at(90) } as unknown as TimetableFluid
    expect(intraopFluidTotalLabel(fluid, ctx)).toBe("750 mL · 1 h 30 min · 500 mL/h")
  })

  it("a rate fluid with a change counts each stretch", () => {
    const fluid = { id: "f", name: "Ringer", volume: "", color: "#0ff", startCol: 0, endCol: 17, stopped: true, fluidEntryMode: "RATE", rate: 600, unit: "mL/h", startTs: at(0), endTs: at(60),
      rateChanges: [{ col: 6, ts: at(30), rate: 200, unit: "mL/h" }] } as unknown as TimetableFluid
    expect(intraopFluidTotalLabel(fluid, ctx)).toBe("400 mL · 1 h · 200 mL/h")
  })

  it("a bag: what was given of how much, and the mean rate", () => {
    const fluid = { id: "b", name: "NaCl", volume: "500", color: "#0ff", startCol: 0, endCol: 5, stopped: true, fluidEntryMode: "VOLUME", bagVolumeMl: 500, administeredVolumeMl: 300, startTs: at(0), endTs: at(40) } as unknown as TimetableFluid
    expect(intraopFluidTotalLabel(fluid, { ...ctx, language: "bg" })).toBe("300 mL от сак 500 mL · 40 min · ≈ 450 mL/h")
  })

  it("an infusion: the amount and how long; a running one has run until now", () => {
    const infusion = { id: "i", name: "Propofol", rate: "6", unit: "mg/kg/h", color: "#00f", startCol: 0, endCol: 17, startTs: at(0) } as unknown as TimetableInfusion
    expect(intraopInfusionTotalLabel(infusion, ctx)).toMatch(/ · 1 h 30 min$/)
  })

  it("by the id a PWA row gives it", () => {
    const timetable = { agents: [{ name: "Sevoflurane", startCol: 0, endCol: 5 }], infusions: [], fluids: [], vitals: {}, drugs: [] } as unknown as TimetableData
    expect(intraopRunTotalLabel(timetable, "agent-Sevoflurane", 5, ctx)).toBe("30 min")
    expect(intraopRunTotalLabel(timetable, "fluid-none", 5, ctx)).toBeNull()
  })
})

describe("a stopped run with no recorded end", () => {
  it("does not keep growing after it stopped: it is counted in whole cells", () => {
    const fluid = { id: "f", name: "Ringer", volume: "", color: "#0ff", startCol: 0, endCol: 5, stopped: true, fluidEntryMode: "RATE", rate: 600, unit: "mL/h", startTs: at(0) } as unknown as TimetableFluid
    const soon = intraopFluidTotalLabel(fluid, { ...ctx, now: at(40) })
    const later = intraopFluidTotalLabel(fluid, { ...ctx, now: at(400) })
    expect(later).toBe(soon)
    expect(soon).toContain("30 min")
  })
})
