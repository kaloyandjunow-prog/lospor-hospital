import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { calcEquipment } from "@lospor/core/equipment"

const setEquipmentScreen = vi.fn(async () => {})
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key, language: "en", equipmentScreen: "smart", setEquipmentScreen }) }))

import { render } from "@/test/render"
import { EquipmentScreenCard } from "@/components/settings/EquipmentScreenCard"
import { EquipmentSmart } from "./EquipmentSmart"

const adult = calcEquipment({ clinicalMode: "ADULT", age: null, ageYears: 44, weightKg: 82, heightCm: 182, sex: "MALE", airway: { mallampati: "III", neckMobility: "REDUCED", mouthOpeningCm: 3, cormackLehane: null } } as never)
const byId = (tree: ReturnType<typeof render>, id: string) => tree.root.findAll(node => node.props?.testID === id)[0]
const present = (tree: ReturnType<typeof render>, id: string) => byId(tree, id) !== undefined
const press = (tree: ReturnType<typeof render>, id: string) => act(() => { byId(tree, id)!.props.onPress() })

function setup(over: Partial<Parameters<typeof EquipmentSmart>[0]> = {}) {
  const onFlag = vi.fn()
  const onPreparedChange = vi.fn()
  const onUseAirway = vi.fn()
  const tree = render(<EquipmentSmart raw={adult} shown={adult} flags={{ urinaryCatheter: false, stomachTube: false }} airwayEntries={[]} prepared={{}} onFlag={onFlag} onPreparedChange={onPreparedChange} onUseAirway={onUseAirway} {...over} />)
  return { tree, onFlag, onPreparedChange, onUseAirway }
}

describe("Smart selection, the Equipment tab on the phone", () => {
  it("shows recorded-vs-suggested cards and keeps preparation/reference collapsed", () => {
    const { tree } = setup()
    for (const label of ["ETT size", "LMA size", "Urinary catheter", "NGT"]) expect(present(tree, `equipment-tracked-${label}`)).toBe(true)
    expect(present(tree, "equipment-preparation")).toBe(true)
    expect(present(tree, "equipment-progress")).toBe(false)
  })

  it("records a suggested tube directly in Airway with an explicit action", () => {
    const { tree, onUseAirway } = setup()
    press(tree, "equipment-record-ETT-size")
    expect(onUseAirway).toHaveBeenCalledWith("ORAL_ETT")
  })

  it("shows an actual match when a recorded airway entry has the suggested details", () => {
    const { tree, onUseAirway } = setup({ airwayEntries: [{ id: "ett-1", device: "ORAL_ETT", details: { oralTubeSize: 8, oralCuffed: true }, status: "in_use" }] })
    expect(byId(tree, "equipment-tracked-ETT size")!.findAll(node => String(node.type) === "Text").map(node => node.props.children).flat().join(" ")).toContain("eqsMatched")
    expect(onUseAirway).not.toHaveBeenCalled()
  })

  it("with the airway panel wired, the record button opens it to ask the time and writes nothing yet", () => {
    const airway = {
      entries: [], patient: { clinicalMode: "ADULT" as const, ageYears: 44, age: null, weightKg: 82, heightCm: 182, sex: "MALE" as const },
      startedAt: "2026-11-09T08:00:00.000Z", now: () => "2026-11-09T08:30:00.000Z", timeZone: "Europe/Sofia", difficultAirway: false,
      deviceLabel: (code: string) => code, toolLabel: (code: string) => code, toolCodes: [], conflict: () => false, onSave: vi.fn(),
    }
    const { tree, onUseAirway } = setup({ airway })
    press(tree, "equipment-record-ETT-size")
    expect(onUseAirway).not.toHaveBeenCalled()
    expect(present(tree, "equipment-airway-panel")).toBe(true)
    expect(airway.onSave).not.toHaveBeenCalled()
  })

  it("the LMA has an explicit record action", () => {
    const { tree, onUseAirway } = setup()
    press(tree, "equipment-record-LMA-size")
    expect(onUseAirway).toHaveBeenCalledWith("LMA")
  })

  it("the catheter and NGT use explicit clinical actions", () => {
    const { tree, onFlag } = setup()
    press(tree, "equipment-record-NGT")
    expect(onFlag).toHaveBeenCalledWith("stomachTube")
    press(tree, "equipment-record-Urinary catheter")
    expect(onFlag).toHaveBeenCalledWith("urinaryCatheter")
  })

  it("keeps preparation as a separate persisted reference", () => {
    const { tree, onPreparedChange } = setup()
    press(tree, "equipment-preparation-toggle")
    press(tree, "equipment-preparation-Laryngoscope")
    expect(onPreparedChange).toHaveBeenCalledWith("Airway|Laryngoscope", true)
  })
})

describe("the Equipment tab setting on the phone", () => {
  it("offers Smart selection and Legacy and saves the one picked", () => {
    const tree = render(<EquipmentScreenCard />)
    expect(present(tree, "equipment-screen-smart")).toBe(true)
    act(() => { byId(tree, "equipment-screen-legacy")!.props.onPress() })
    expect(setEquipmentScreen).toHaveBeenCalledWith("legacy")
  })
})
