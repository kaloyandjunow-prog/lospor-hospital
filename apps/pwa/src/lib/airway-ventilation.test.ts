import { describe, expect, it } from "vitest"
import { expandedVentilationPanelForModes } from "./airway-ventilation"

describe("expandedVentilationPanelForModes", () => {
  it("opens the assisted panel when an assisted mode is saved", () => {
    expect(expandedVentilationPanelForModes(["PSV"])).toBe("assisted")
  })

  it("opens the controlled panel when only controlled modes are saved", () => {
    expect(expandedVentilationPanelForModes(["VCV"])).toBe("controlled")
  })

  it("prefers assisted when both assisted and controlled modes are saved", () => {
    expect(expandedVentilationPanelForModes(["PCV", "CPAP"])).toBe("assisted")
  })

  it("returns null when no known mode is saved", () => {
    expect(expandedVentilationPanelForModes(["UNKNOWN"])).toBeNull()
    expect(expandedVentilationPanelForModes([])).toBeNull()
  })
})
