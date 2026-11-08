// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { calcEquipment } from "@lospor/core/equipment"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }))

import { EquipmentSmart } from "./EquipmentSmart"

const adult = calcEquipment({ clinicalMode: "ADULT", age: null, ageYears: 44, weightKg: 82, heightCm: 182, sex: "MALE", airway: { mallampati: "III", neckMobility: "REDUCED", mouthOpeningCm: 3, cormackLehane: null } } as never)

function setup(overrides: Partial<Parameters<typeof EquipmentSmart>[0]> = {}) {
  const onFlag = vi.fn()
  const onPreparedChange = vi.fn()
  const onUseAirway = vi.fn()
  render(<EquipmentSmart categories={adult} flags={{ urinaryCatheter: false, stomachTube: false }} airwayEntries={[]} prepared={{}} onFlag={onFlag} onPreparedChange={onPreparedChange} onUseAirway={onUseAirway}
    categoryName={name => name} labelOf={label => label} textOf={text => text} {...overrides} />)
  return { onFlag, onPreparedChange, onUseAirway }
}

describe("Smart selection, the Equipment card (10.2.0)", () => {
  it("shows recorded-vs-suggested cards and keeps preparation/reference collapsed", () => {
    setup()
    for (const label of ["ETT size", "LMA size", "Urinary catheter", "NGT"]) expect(screen.getByTestId(`equipment-tracked-${label}`)).toBeTruthy()
    expect(screen.getByTestId("equipment-preparation")).toBeTruthy()
    expect(screen.queryByTestId("equipment-preparation-group-Airway")).toBeNull()
    expect(screen.queryByTestId("equipment-progress")).toBeNull()
  })

  it("records a suggested tube directly in Airway with an explicit action", () => {
    const { onUseAirway } = setup()
    fireEvent.click(screen.getByTestId("equipment-record-ETT-size"))
    expect(onUseAirway).toHaveBeenCalledWith("ORAL_ETT")
  })

  it("shows an actual match when a recorded airway entry has the suggested details", () => {
    const { onUseAirway } = setup({ airwayEntries: [{ id: "ett-1", device: "ORAL_ETT", details: { oralTubeSize: 8, oralCuffed: true }, status: "in_use" }] })
    expect(screen.getByTestId("equipment-tracked-ETT size").textContent).toContain("matched")
    expect(onUseAirway).not.toHaveBeenCalled()
  })

  it("the LMA has an explicit record action", () => {
    const { onUseAirway } = setup()
    fireEvent.click(screen.getByTestId("equipment-record-LMA-size"))
    expect(onUseAirway).toHaveBeenCalledWith("LMA")
  })

  it("the catheter and NGT use explicit clinical actions", () => {
    const { onFlag } = setup()
    fireEvent.click(screen.getByTestId("equipment-record-NGT"))
    expect(onFlag).toHaveBeenCalledWith("stomachTube")
    fireEvent.click(screen.getByTestId("equipment-record-Urinary catheter"))
    expect(onFlag).toHaveBeenCalledWith("urinaryCatheter")
  })

  it("shows a recorded flag as incomplete rather than pretending a size was charted", () => {
    setup({ flags: { urinaryCatheter: true, stomachTube: false } })
    expect(screen.getByTestId("equipment-tracked-Urinary catheter").textContent).toContain("recordedIncomplete")
  })

  it("keeps preparation as a separate persisted reference", () => {
    const { onPreparedChange } = setup()
    fireEvent.click(screen.getByTestId("equipment-preparation-toggle"))
    fireEvent.click(screen.getByTestId("equipment-preparation-Laryngoscope"))
    expect(onPreparedChange).toHaveBeenCalledWith("Airway|Laryngoscope", true)
  })
})
