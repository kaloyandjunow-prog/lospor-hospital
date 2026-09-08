import { describe, expect, it } from "vitest"
import { localizeSummaryTimetableModel, resolveIntraopEventLabel, summaryLaneDomain } from "./clinical-display"
import type { SummaryTimetableModel } from "./summary-timetable"

describe("summaryLaneDomain", () => {
  it("maps each lane kind PrintTimetable draws to the same option domain the model-based summary uses", () => {
    expect(summaryLaneDomain("agent")).toBe("option:INHALATIONAL_AGENT")
    expect(summaryLaneDomain("infusion")).toBe("option:INTRAOP_INFUSION")
    expect(summaryLaneDomain("fluid")).toBe("option:INTRAOP_FLUID")
    expect(summaryLaneDomain("position")).toBe("option:POSITION")
  })

  it("has no code domain of its own for gas -- gas text is formatted by formatClinicalGasMixLabel instead", () => {
    expect(summaryLaneDomain("gas")).toBeNull()
  })
})

describe("resolveIntraopEventLabel", () => {
  it("resolves a known event code through the option domain", () => {
    expect(resolveIntraopEventLabel("AIRWAY_INDUCTION", "bg")).toBe("Увод")
    expect(resolveIntraopEventLabel("AIRWAY_INDUCTION", "en")).toBe("Induction")
  })

  it("falls back to the complication label for an unmapped code, rather than the raw code", () => {
    const label = resolveIntraopEventLabel("some-legacy-free-text-event", "en")
    expect(label).not.toBe("")
    expect(typeof label).toBe("string")
  })
})

describe("localizeSummaryTimetableModel", () => {
  const model: SummaryTimetableModel = {
    nCols: 10,
    vitals: [],
    events: [{ col: 2, label: "AIRWAY_INDUCTION" }],
    drugTicks: [],
    lanes: [
      {
        kind: "position",
        label: "Position",
        color: "#000",
        segments: [{ startCol: 0, endCol: 5, text: "FOWLER", code: "FOWLER" }],
      },
    ],
    hasData: true,
  }

  it("localizes an event label the same way resolveIntraopEventLabel does directly", () => {
    const localized = localizeSummaryTimetableModel(model, "bg")
    expect(localized.events[0].label).toBe(resolveIntraopEventLabel("AIRWAY_INDUCTION", "bg"))
  })

  it("localizes a lane segment's code through the shared domain mapping", () => {
    const localized = localizeSummaryTimetableModel(model, "bg")
    expect(localized.lanes[0].segments[0].text).toBe("Позиция на Фаулър")
  })
})
