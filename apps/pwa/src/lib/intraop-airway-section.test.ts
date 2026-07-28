import { describe, expect, it } from "vitest"
import { buildAirwaySectionPatch, isAirwayDeviceComplete, syncAirwayDeviceSelection } from "./intraop-airway-section"

const baseInput = {
  awTools: ["VIDEO"],
  awDevices: ["ORAL_ETT"],
  awLmaSize: null,
  awOralTubeSize: null,
  awOralCuffed: null,
  awNasalTubeSize: null,
  awNasalCuffed: null,
  awDltType: null,
  awDltSide: null,
  awDltSize: null,
  awEbSize: null,
  awClGrade: "",
  awVentModes: [],
  awNotes: "",
}

describe("buildAirwaySectionPatch", () => {
  it("maps airway arrays and converts numeric string sizes", () => {
    expect(buildAirwaySectionPatch({
      ...baseInput,
      awLmaSize: "4",
      awOralTubeSize: "7.5",
      awNasalTubeSize: "6.5",
      awClGrade: "2",
      awVentModes: ["VCV"],
      awNotes: "easy",
    })).toMatchObject({
      airwayTools: ["VIDEO"],
      airwayDevices: ["ORAL_ETT"],
      lmaSize: 4,
      oralTubeSize: 7.5,
      nasalTubeSize: 6.5,
      cormackLehane: "2",
      ventilationModes: ["VCV"],
      airwayNotes: "easy",
    })
  })

  it("preserves nullable device fields and stores empty CL grade as null", () => {
    expect(buildAirwaySectionPatch(baseInput)).toMatchObject({
      lmaSize: null,
      oralTubeSize: null,
      oralCuffed: null,
      nasalTubeSize: null,
      nasalCuffed: null,
      dltType: null,
      dltSide: null,
      dltSize: null,
      endobronchialSize: null,
      cormackLehane: null,
    })
  })
})

describe("isAirwayDeviceComplete", () => {
  it("requires the device-specific airway fields", () => {
    expect(isAirwayDeviceComplete("LMA", { ...baseInput, awLmaSize: "4" })).toBe(true)
    expect(isAirwayDeviceComplete("LMA", baseInput)).toBe(false)

    expect(isAirwayDeviceComplete("ORAL_ETT", {
      ...baseInput,
      awOralTubeSize: "7.5",
      awOralCuffed: false,
    })).toBe(true)
    expect(isAirwayDeviceComplete("ORAL_ETT", { ...baseInput, awOralTubeSize: "7.5" })).toBe(false)

    expect(isAirwayDeviceComplete("NASAL_ETT", {
      ...baseInput,
      awNasalTubeSize: "6.5",
      awNasalCuffed: true,
    })).toBe(true)
    expect(isAirwayDeviceComplete("NASAL_ETT", { ...baseInput, awNasalCuffed: true })).toBe(false)

    expect(isAirwayDeviceComplete("DOUBLE_LUMEN_TUBE", {
      ...baseInput,
      awDltType: "Robertshaw",
      awDltSide: "Left",
      awDltSize: 37,
    })).toBe(true)
    expect(isAirwayDeviceComplete("DOUBLE_LUMEN_TUBE", { ...baseInput, awDltType: "Robertshaw", awDltSize: 37 })).toBe(false)

    expect(isAirwayDeviceComplete("ENDOBRONCHIAL_TUBE", { ...baseInput, awEbSize: 8 })).toBe(true)
    expect(isAirwayDeviceComplete("UNKNOWN", baseInput)).toBe(false)
  })
})

describe("syncAirwayDeviceSelection", () => {
  it("adds complete devices and removes incomplete devices", () => {
    expect(syncAirwayDeviceSelection(["LMA"], "ORAL_ETT", true)).toEqual(["LMA", "ORAL_ETT"])
    expect(syncAirwayDeviceSelection(["LMA", "ORAL_ETT"], "ORAL_ETT", false)).toEqual(["LMA"])
  })

  it("returns the original list when no change is needed", () => {
    const selected = ["LMA"]
    expect(syncAirwayDeviceSelection(selected, "LMA", true)).toBe(selected)
    expect(syncAirwayDeviceSelection(selected, "ORAL_ETT", false)).toBe(selected)
  })
})
