import { describe, expect, it } from "vitest"
import { VENT_ASSISTED, VENT_CONTROLLED, expandedVentilationPanelForModes } from "./ventilation"
import { COMPLICATION_CATEGORIES, ALL_COMPLICATIONS } from "./complications"
import { CASE_STATUS_LABELS, type CaseStatus } from "./case-status"

describe("ventilation", () => {
  it("classifies saved modes into the correct expanded panel", () => {
    expect(expandedVentilationPanelForModes(["PSV"])).toBe("assisted")
    expect(expandedVentilationPanelForModes(["VCV"])).toBe("controlled")
    expect(expandedVentilationPanelForModes(["Spontaneous"])).toBe(null)
    expect(expandedVentilationPanelForModes([])).toBe(null)
  })

  it("exposes the full assisted/controlled mode lists", () => {
    expect(VENT_ASSISTED).toHaveLength(6)
    expect(VENT_CONTROLLED).toHaveLength(6)
  })
})

describe("complications", () => {
  it("covers all 8 categories with an English and Bulgarian title", () => {
    expect(COMPLICATION_CATEGORIES).toHaveLength(8)
    for (const cat of COMPLICATION_CATEGORIES) {
      expect(cat.title.length).toBeGreaterThan(0)
      expect(cat.titleBg.length).toBeGreaterThan(0)
      expect(cat.items.length).toBeGreaterThan(0)
    }
  })

  it("flattens every category into ALL_COMPLICATIONS", () => {
    const expectedLength = COMPLICATION_CATEGORIES.reduce((n, c) => n + c.items.length, 0)
    expect(ALL_COMPLICATIONS).toHaveLength(expectedLength)
    expect(ALL_COMPLICATIONS).toContain("Hypotension")
    expect(ALL_COMPLICATIONS).toContain("Seizure")
  })
})

describe("case status labels", () => {
  it("covers all 7 statuses in both languages", () => {
    const statuses: CaseStatus[] = [
      "DRAFT", "IN_CONSULTATION", "AWAITING_ALLOCATION", "IN_PROGRESS",
      "AWAITING_POSTOP", "AWAITING_REVIEW", "COMPLETE",
    ]
    for (const status of statuses) {
      expect(CASE_STATUS_LABELS[status].en.length).toBeGreaterThan(0)
      expect(CASE_STATUS_LABELS[status].bg.length).toBeGreaterThan(0)
    }
  })
})
