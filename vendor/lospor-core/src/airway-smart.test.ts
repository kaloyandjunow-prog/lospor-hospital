import { describe, expect, it } from "vitest"
import { parseAirwayDeviceEntries } from "./airway-device-entries"
import {
  addAirwayDevice, airwayAsks, airwayChoices, airwayClinicalEvent, airwayHowOrder, airwayRecordFields, resolveAirwayTime, suggestedAirwayDetails,
} from "./airway-smart"

const ADULT_MAN = { clinicalMode: "ADULT" as const, ageYears: 45, weightKg: 82, heightCm: 182, sex: "MALE" }
const ADULT_WOMAN = { ...ADULT_MAN, sex: "FEMALE", weightKg: 60 }
const CHILD = { clinicalMode: "PEDIATRIC" as const, ageYears: 6, weightKg: 20 }
const INFANT = { clinicalMode: "PEDIATRIC" as const, age: { value: 8, unit: "MONTHS" as const }, weightKg: 8 }

describe("which devices come first", () => {
  it("leads with the tube, the LMA and the mask for general anaesthesia, whatever else is combined", () => {
    expect(airwayChoices(["GENERAL_TIVA"]).main).toEqual(["ORAL_ETT", "LMA", "FACE_MASK"])
    expect(airwayChoices(["GENERAL_INHALATION", "REGIONAL_SPINAL"]).main).toEqual(["ORAL_ETT", "LMA", "FACE_MASK"])
    expect(airwayChoices([]).main).toEqual(["ORAL_ETT", "LMA", "FACE_MASK"])
    expect(airwayChoices(["GENERAL_TIVA"]).noIntervention).toBe(false)
  })

  it("leads with what keeps the airway open for sedation, and offers no intervention for regional or local alone", () => {
    expect(airwayChoices(["SEDATION_CONSCIOUS"]).main).toEqual(["FACE_MASK", "NPA", "OPA"])
    const regional = airwayChoices(["REGIONAL_SPINAL"])
    expect(regional.main).toEqual(["FACE_MASK"])
    expect(regional.noIntervention).toBe(true)
    expect(airwayChoices(["LOCAL"]).noIntervention).toBe(true)
  })

  it("keeps every device reachable: the first ones and the rest are all nine", () => {
    for (const techniques of [["GENERAL_TIVA"], ["SEDATION_DEEP"], ["REGIONAL_SPINAL"]]) {
      const { main, other } = airwayChoices(techniques)
      expect([...main, ...other].sort()).toEqual(["DOUBLE_LUMEN_TUBE", "ENDOBRONCHIAL_TUBE", "FACE_MASK", "LMA", "NASAL_ETT", "NPA", "OPA", "ORAL_ETT", "SURGICAL_AIRWAY"])
      expect(main.filter(code => other.includes(code))).toEqual([])
    }
  })

  it("includes facility-supplied airway options beyond the built-in catalogue", () => {
    const choices = airwayChoices(["GENERAL_TIVA"], ["ORAL_ETT", "LMA", "FACE_MASK", "CUSTOM_AIRWAY_DEVICE"])
    expect([...choices.main, ...choices.other]).toEqual(["ORAL_ETT", "LMA", "FACE_MASK", "CUSTOM_AIRWAY_DEVICE"])
  })
})

describe("events implied by Smart airway selection", () => {
  it("charts intubation for either tracheal tube and reintubation when one replaces another", () => {
    expect(airwayClinicalEvent("ORAL_ETT")).toBe("Intubated")
    expect(airwayClinicalEvent("NASAL_ETT")).toBe("Intubated")
    expect(airwayClinicalEvent("ORAL_ETT", { replaces: true })).toBe("Intubated")
    expect(airwayClinicalEvent("ORAL_ETT", { replaces: true, priorTrachealTube: true })).toBe("Reintubation")
    expect(airwayClinicalEvent("ORAL_ETT", { priorTrachealTube: true })).toBe("Reintubation")
  })

  it("charts the exact event for LMA and DLT, but does not invent one for a mask or adjunct", () => {
    expect(airwayClinicalEvent("LMA")).toBe("LMA in")
    expect(airwayClinicalEvent("DOUBLE_LUMEN_TUBE")).toBe("DLT placed")
    expect(airwayClinicalEvent("FACE_MASK")).toBe("Mask vent")
    expect(airwayClinicalEvent("OPA")).toBe("OPA in")
    expect(airwayClinicalEvent("NPA")).toBe("NPA in")
    expect(airwayClinicalEvent("ENDOBRONCHIAL_TUBE")).toBe("Endobronchial tube in")
    expect(airwayClinicalEvent("SURGICAL_AIRWAY")).toBe("Surgical airway in")
  })
})

describe("the size and cuff suggested for this patient, as the equipment card says", () => {
  it("an adult man gets 8.0 cuffed and LMA 5, a woman 7.5 cuffed and LMA 4", () => {
    expect(suggestedAirwayDetails("ORAL_ETT", ADULT_MAN)).toEqual({ oralTubeSize: 8, oralCuffed: true })
    expect(suggestedAirwayDetails("LMA", ADULT_MAN)).toEqual({ lmaSize: 5 })
    expect(suggestedAirwayDetails("ORAL_ETT", ADULT_WOMAN)).toEqual({ oralTubeSize: 7.5, oralCuffed: true })
    expect(suggestedAirwayDetails("LMA", ADULT_WOMAN)).toEqual({ lmaSize: 4 })
  })

  it("a child gets the cuffed size from age and the LMA from weight", () => {
    expect(suggestedAirwayDetails("ORAL_ETT", CHILD)).toEqual({ oralTubeSize: 5, oralCuffed: true })
    expect(suggestedAirwayDetails("LMA", CHILD)).toEqual({ lmaSize: 2.5 })
    expect(suggestedAirwayDetails("NASAL_ETT", CHILD)).toEqual({ nasalTubeSize: 5, nasalCuffed: true })
  })

  it("leaves the tube size to the clinician under two years, and suggests nothing for a mask", () => {
    expect(suggestedAirwayDetails("ORAL_ETT", INFANT)).toEqual({})
    expect(suggestedAirwayDetails("FACE_MASK", ADULT_MAN)).toEqual({})
  })
})

describe("what each device asks", () => {
  it("asks size and cuff for a tube, size for an LMA, and nothing for a mask", () => {
    expect(airwayAsks("ORAL_ETT").map(ask => ask.kind)).toEqual(["size", "cuff"])
    expect(airwayAsks("LMA").map(ask => ask.field)).toEqual(["lmaSize"])
    expect(airwayAsks("DOUBLE_LUMEN_TUBE").map(ask => ask.field)).toEqual(["dltType", "dltSide", "dltSize"])
    expect(airwayAsks("FACE_MASK")).toEqual([])
  })

  it("puts video laryngoscopy and fibreoptic first when the preop record lists a difficult airway", () => {
    expect(airwayHowOrder(true).slice(0, 3)).toEqual(["VIDEO_LARY", "FOB", "AWAKE"])
    expect(airwayHowOrder(false)[0]).toBe("VIDEO_LARY")
    expect(new Set(airwayHowOrder(true)).size).toBe(8)
  })
})

describe("when it went in", () => {
  const context = { startedAt: "2026-11-02T09:30:00.000Z", now: "2026-11-02T09:55:00.000Z" }
  it("takes the start of anaesthesia, now, a time picked, or the timeline cell", () => {
    expect(resolveAirwayTime("start", context)).toBe(context.startedAt)
    expect(resolveAirwayTime("now", context)).toBe(context.now)
    expect(resolveAirwayTime("pick", { ...context, picked: "2026-11-02T09:35:00Z" })).toBe("2026-11-02T09:35:00.000Z")
    expect(resolveAirwayTime("timeline", { ...context, picked: "2026-11-02T09:40:00.000Z" })).toBe("2026-11-02T09:40:00.000Z")
  })

  it("requires an explicit time when the start or picked time is missing", () => {
    expect(resolveAirwayTime("start", { startedAt: null, now: context.now })).toBeNull()
    expect(resolveAirwayTime("now", { startedAt: null, now: context.now })).toBeNull()
    expect(resolveAirwayTime("pick", { ...context, picked: "later" })).toBeNull()
  })
})

describe("writing the device to the case", () => {
  const at = "2026-11-02T09:35:00.000Z"
  it("adds a device with its tools, and keeps the old fields and the case-level tools in step", () => {
    const entries = addAirwayDevice([], { id: "a1", device: "ORAL_ETT", details: { oralTubeSize: 8, oralCuffed: true }, insertedAt: at, instruments: ["VIDEO_LARY", "BOUGIE"] })
    expect(entries).toHaveLength(1)
    const fields = airwayRecordFields(entries, ["STYLET"])
    expect(fields.airwayDevices).toEqual(["ORAL_ETT"])
    expect(fields.oralTubeSize).toBe(8)
    expect([...(fields.airwayTools as string[])].sort()).toEqual(["BOUGIE", "STYLET", "VIDEO_LARY"])
  })

  it("keeps both tubes after a reintubation: the first failed, the second in use", () => {
    const first = addAirwayDevice([], { id: "a1", device: "ORAL_ETT", details: { oralTubeSize: 8, oralCuffed: true }, insertedAt: at })
    const both = addAirwayDevice(first, { id: "a2", device: "ORAL_ETT", details: { oralTubeSize: 7.5, oralCuffed: true }, insertedAt: "2026-11-02T09:55:00.000Z", replaces: { id: "a1", reason: "failed_device" } })
    expect(both.map(entry => [entry.id, entry.status])).toEqual([["a1", "failed"], ["a2", "in_use"]])
    expect(both[0]!.endedAt).toBe("2026-11-02T09:55:00.000Z")
    const planned = addAirwayDevice(first, { id: "a2", device: "LMA", details: { lmaSize: 5 }, insertedAt: at, replaces: { id: "a1", reason: "planned" } })
    expect(planned[0]!.status).toBe("replaced")
  })

  it("survives the stored form, tools included, and drops a tool it does not know", () => {
    const entries = addAirwayDevice([], { id: "a1", device: "LMA", details: { lmaSize: 4 }, insertedAt: at, instruments: ["VIDEO_LARY"] })
    const stored = JSON.parse(JSON.stringify(entries)) as Array<Record<string, unknown>>
    expect(parseAirwayDeviceEntries(stored)[0]!.instruments).toEqual(["VIDEO_LARY"])
    stored[0]!.instruments = ["VIDEO_LARY", "MAGIC"]
    expect(parseAirwayDeviceEntries(stored)[0]!.instruments).toEqual(["VIDEO_LARY"])
  })
})
