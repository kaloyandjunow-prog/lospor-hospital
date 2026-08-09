// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { EquipmentSuggestions } from "./EquipmentSuggestions"

describe("EquipmentSuggestions", () => {
  it("renders fixed pediatric guidance without a ruleset payload", () => {
    render(
      <EquipmentSuggestions
        clinicalMode="PEDIATRIC"
        ageValue={5}
        ageUnit="YEARS"
        ageYears={5}
        weightKg={20}
        heightCm={110}
        sex="MALE"
      />,
    )

    expect(screen.getByText("Suggested equipment & sizes")).toBeTruthy()
    expect(screen.getByText("ETT size")).toBeTruthy()
    expect(screen.getByText(/Starting estimate/)).toBeTruthy()
    expect(screen.getByText(/McLaren IBW/)).toBeTruthy()
    expect(screen.queryByText(/institution preset/i)).toBeNull()
  })

  it("keeps the established adult equipment rows", () => {
    render(
      <EquipmentSuggestions
        clinicalMode="ADULT"
        ageYears={45}
        weightKg={80}
        heightCm={180}
        sex="MALE"
      />,
    )

    expect(screen.getByText("ETT size")).toBeTruthy()
    expect(screen.getByText("Tidal volume")).toBeTruthy()
    expect(screen.getByText("Urinary catheter")).toBeTruthy()
    expect(screen.getByText("Defibrillator")).toBeTruthy()
  })
})
