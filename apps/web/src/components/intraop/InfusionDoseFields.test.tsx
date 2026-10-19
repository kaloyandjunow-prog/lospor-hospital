// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { InfusionDoseFields } from "./InfusionDoseFields"
import type { TtFP } from "./timetable-types"

vi.mock("next-intl", () => ({ useLocale: () => "en" }))

// The start flyout's infusion fields (2026-10-18). An adult catalogue infusion
// has no per-route profile -- the case the first browser check found without
// a syringe row -- and must still get the syringe, the units and both rates.
const fp = {
  col: 0, name: "Norepinephrine / Noradrenaline", unit: "mcg/kg/min", mode: "infusion", dose: "", doseHint: "",
  rate: 0.1, rateUnit: "mcg/kg/min", rateUnits: ["mcg/kg/min"], rateMin: 0, rateMax: 3, rateStep: 0.01,
  color: "#a855f7", quickRates: [0.05, 0.1], routes: ["IV"], route: "IV", anchor: {} as never,
} as unknown as TtFP

const doseSurfaces = {
  guidanceEnabled: true,
  infusionRouteSurface: () => undefined,
  clinicalPediatricInfusionFor: () => ({ rule: null, surface: null, conflict: false }),
} as never

function fields(over: Partial<TtFP> = {}, onConfirm = vi.fn(), setFp = vi.fn()) {
  render(
    <InfusionDoseFields
      fp={{ ...fp, ...over }} setFp={setFp} doseSurfaces={doseSurfaces} isPediatric={false}
      laConcentrations={{}} infusionWeightBasis={{ "Norepinephrine / Noradrenaline": "IBW" }}
      ibw={70} tbw={80} onConfirm={onConfirm}
    />,
  )
  return { onConfirm, setFp }
}

describe("an adult catalogue infusion", () => {
  it("offers the syringes and the units, with mL/hr", () => {
    fields()
    expect(screen.getByText("Syringe")).toBeTruthy()
    expect(screen.getByRole("button", { name: "4 mg/50 mL" })).toBeTruthy()
    for (const unit of ["mcg/kg/min", "mcg/min", "mL/hr"]) expect(screen.getByRole("button", { name: unit })).toBeTruthy()
  })

  it("reads out the pump rate at a syringe, on its weight basis, and records both rates", () => {
    const { onConfirm } = fields({ concentration: "4 mg/50 mL" })
    // Dosed on ideal weight: 0.1 × 70 kg × 60 / 80 mcg/mL.
    expect(screen.getByText(/5\.25 mL\/hr on the pump/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Start Infusion/ }))
    expect(onConfirm).toHaveBeenCalledWith({ rate: 0.1, unit: "mcg/kg/min", volumeRateMlPerHour: 5.25, calculationWeightKg: 70 })
  })

  it("records the dose rate alone when the syringe is skipped", () => {
    const { onConfirm } = fields()
    fireEvent.click(screen.getByRole("button", { name: /Start Infusion/ }))
    expect(onConfirm).toHaveBeenCalledWith({ rate: 0.1, unit: "mcg/kg/min", calculationWeightKg: 70 })
  })

  it("keeps a typed custom infusion's free unit choice", () => {
    fields({ name: "Something typed", rateUnits: ["mg/hr", "mcg/kg/min", "ml/hr"], rateUnit: "mg/hr" })
    expect(screen.queryByText("Syringe")).toBeNull()
  })
})

describe("a syringe typed with Other", () => {
  it("opens sliders prefilled from the drug's syringes", () => {
    fields({ customConc: "…" })
    const group = screen.getByTestId("syringe-custom-fields")
    expect(group.querySelectorAll("input[type=number]")[0]).toHaveProperty("value", "4")
    expect(group.querySelectorAll("input[type=number]")[1]).toHaveProperty("value", "50")
    for (const unit of ["mg", "mcg"]) expect(screen.getAllByRole("button", { name: unit }).length).toBeGreaterThan(0)
  })

  it("says what is wrong and holds the start back", () => {
    fields({ customConc: "…", concentration: undefined })
    const amount = screen.getByTestId("syringe-custom-fields").querySelectorAll("input[type=number]")[0]!
    fireEvent.change(amount, { target: { value: "0" } })
    expect(screen.getByRole("alert").textContent).toMatch(/amount/i)
    expect(screen.getByRole("button", { name: /Start Infusion/ })).toHaveProperty("disabled", true)
  })
})

describe("an infusion with no rate", () => {
  it("says why Start is off", () => {
    fields({ rate: 0 })
    expect(screen.getByTestId("dose-confirm-blocked").textContent).toMatch(/rate above 0/)
    expect(screen.getByRole("button", { name: /Start Infusion/ })).toHaveProperty("disabled", true)
  })

  it("says nothing when it can start", () => {
    fields()
    expect(screen.queryByTestId("dose-confirm-blocked")).toBeNull()
  })
})
