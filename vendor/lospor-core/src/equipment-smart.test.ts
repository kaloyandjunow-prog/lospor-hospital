import { describe, expect, it } from "vitest"
import { calcEquipment } from "./equipment"
import { equipmentGroups, equipmentNeedsChoice, equipmentRecordState, equipmentTapAction, equipmentTarget, toggleEquipmentFlag } from "./equipment-smart"

const adult = calcEquipment({ clinicalMode: "ADULT", age: null, ageYears: 44, weightKg: 82, heightCm: 182, sex: "MALE", airway: { mallampati: "III", neckMobility: "REDUCED", mouthOpeningCm: 3, cormackLehane: null } } as never)

describe("Smart selection for the Equipment tab (10.2.0)", () => {
  it("knows which items write to the case", () => {
    expect(equipmentTarget("ETT size")).toEqual({ kind: "airway", device: "ORAL_ETT" })
    expect(equipmentTarget("LMA size")).toEqual({ kind: "airway", device: "LMA" })
    expect(equipmentTarget("NGT")).toEqual({ kind: "flag", field: "stomachTube" })
    expect(equipmentTarget("Urinary catheter")).toEqual({ kind: "flag", field: "urinaryCatheter" })
    expect(equipmentTarget("Guedel OPA")).toBeNull()
  })

  it("an airway item is ready on the first tap and in use on the second, and cannot be un-used from here", () => {
    expect(equipmentTapAction("ETT size", { ready: false, inUse: false })).toBe("ready")
    expect(equipmentTapAction("ETT size", { ready: true, inUse: false })).toBe("use")
    expect(equipmentTapAction("ETT size", { ready: true, inUse: true })).toBe("none")
  })

  it("the catheter and NGT write their flag at once, and a second tap clears it", () => {
    expect(equipmentTapAction("NGT", { ready: false, inUse: false })).toBe("flag")
    expect(equipmentTapAction("NGT", { ready: false, inUse: true })).toBe("unflag")
    expect(toggleEquipmentFlag(["ecg"], "stomachTube")).toEqual(["ecg", "stomachTube"])
    expect(toggleEquipmentFlag(["ecg", "stomachTube"], "stomachTube")).toEqual(["ecg"])
  })

  it("any other item is a plain tick", () => {
    expect(equipmentTapAction("Guedel OPA", { ready: false, inUse: false })).toBe("ready")
    expect(equipmentTapAction("Guedel OPA", { ready: true, inUse: false })).toBe("unready")
  })

  it("reads done from the record, not from the device", () => {
    const record = { flags: { urinaryCatheter: true, stomachTube: false }, airwayInUse: ["ORAL_ETT"] }
    expect(equipmentRecordState("Urinary catheter", record)).toBe("in_use")
    expect(equipmentRecordState("NGT", record)).toBeNull()
    expect(equipmentRecordState("ETT size", record)).toBe("in_use")
    expect(equipmentRecordState("LMA size", record)).toBeNull()
    expect(equipmentRecordState("Guedel OPA", record)).toBeNull()
  })

  it("puts the difficult airway group first and takes the glance items out of Airway", () => {
    const groups = equipmentGroups(adult)
    expect(groups[0]).toMatchObject({ cat: "Difficult Airway", difficultAirway: true })
    expect(groups.find(group => group.cat === "Airway")).toBeUndefined()
    expect(groups.map(group => group.cat)).toContain("Ventilation")
  })

  it("recognises the words the calculator uses when a size is left to the clinician", () => {
    for (const value of ["Select manually", "Measure manually", "Calculate manually from actual ETT ID", "Prepare a curved blade; choose exact size manually"]) expect(equipmentNeedsChoice(value)).toBe(true)
    for (const value of ["8", "20 cm", "Size 5", "14 Fr"]) expect(equipmentNeedsChoice(value)).toBe(false)
  })
})
