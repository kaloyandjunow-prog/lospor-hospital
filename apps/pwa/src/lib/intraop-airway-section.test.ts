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
  awPresentsIntubated: false,
  awNotApplicable: false,
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
      awPresentsIntubated: false,
      awNotApplicable: false,
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

describe("why there is no airway device of this team's own", () => {
  it("carries both reasons into the patch", () => {
    // These were web-only React state: they relaxed the finalisation gate and
    // were then discarded, so the saved record showed no airway device and no
    // reason for it. They have to reach the server to be worth anything.
    expect(buildAirwaySectionPatch({ ...baseInput, awPresentsIntubated: true }))
      .toMatchObject({ presentsIntubated: true, airwayNotApplicable: false })
    expect(buildAirwaySectionPatch({ ...baseInput, awNotApplicable: true }))
      .toMatchObject({ presentsIntubated: false, airwayNotApplicable: true })
  })

  it("sends explicit false rather than omitting the flags", () => {
    // An absent key is dropped from the patch as "not mentioned", so a flag
    // that was turned back off would silently keep its previous true.
    const patch = buildAirwaySectionPatch(baseInput)
    expect(patch).toHaveProperty("presentsIntubated", false)
    expect(patch).toHaveProperty("airwayNotApplicable", false)
  })
})
