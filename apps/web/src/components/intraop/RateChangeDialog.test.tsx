// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { RateChangeDialog, type RateChangeState } from "./RateChangeDialog"

vi.mock("next-intl", () => ({ useLocale: () => "en" }))

const state: RateChangeState = {
  name: "Noradrenaline",
  rate: 0.1,
  unit: "mcg/kg/min",
  units: ["mcg/kg/min"],
  rateMin: 0.01,
  rateMax: 1,
  rateStep: 0.01,
  color: "#2563eb",
  step: "rate",
  timeH: "",
  timeM: "",
}

describe("RateChangeDialog guidance policy", () => {
  it("keeps the configured range and calculation basis visible by default", () => {
    render(
      <RateChangeDialog
        state={state}
        displayName="Noradrenaline"
        concentrations={undefined}
        weightBasis={{ basis: "IBW", weightKg: 70 }}
        hours={[]}
        minutes={[]}
        labels={{
          setNewRatePrompt: "Enter the recorded rate",
          pickRateChangeTime: "Pick time",
          concentration: "Concentration",
        }}
        onPatch={vi.fn()}
        onApply={vi.fn()}
        onConfirmTime={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByRole("spinbutton")).toHaveProperty("value", "0.1")
    expect(screen.getByRole("slider")).toBeTruthy()
    expect(screen.getByText(/IBW/)).toBeTruthy()
  })

  it("retains manual entry when an administrator explicitly disables guidance", () => {
    render(
      <RateChangeDialog
        state={state}
        displayName="Noradrenaline"
        concentrations={undefined}
        weightBasis={{ basis: "IBW", weightKg: 70 }}
        hours={[]}
        minutes={[]}
        labels={{
          setNewRatePrompt: "Enter the recorded rate",
          pickRateChangeTime: "Pick time",
          concentration: "Concentration",
        }}
        showDoseGuidance={false}
        onPatch={vi.fn()}
        onApply={vi.fn()}
        onConfirmTime={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByRole("spinbutton")).toHaveProperty("value", "0.1")
    expect(screen.queryByRole("slider")).toBeNull()
    expect(screen.queryByText(/IBW/)).toBeNull()
  })
})

describe("RateChangeDialog syringe and both rates (2026-10-18)", () => {
  const syringe: RateChangeState = {
    ...state, name: "Norepinephrine / Noradrenaline", rateMax: 3, rateMin: 0,
    concentration: "4 mg/50 mL", ruleUnit: "mcg/kg/min", weightKg: 70,
  }

  it("offers the syringes, the units and the pump readout", () => {
    render(
      <RateChangeDialog
        state={syringe} displayName="Noradrenaline" concentrations={undefined} offerSyringes
        weightBasis={null} hours={[]} minutes={[]}
        labels={{ setNewRatePrompt: "", pickRateChangeTime: "", concentration: "Concentration" }}
        onPatch={vi.fn()} onApply={vi.fn()} onConfirmTime={vi.fn()} onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText("Syringe")).toBeTruthy()
    expect(screen.getByRole("button", { name: "4 mg/50 mL" })).toBeTruthy()
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["mcg/kg/min", "mcg/min", "mL/hr"])
    expect(screen.getByText("5.25 mL/hr on the pump")).toBeTruthy()
  })

  it("carries the value across when the unit changes", () => {
    const onPatch = vi.fn()
    render(
      <RateChangeDialog
        state={syringe} displayName="Noradrenaline" concentrations={undefined} offerSyringes
        weightBasis={null} hours={[]} minutes={[]}
        labels={{ setNewRatePrompt: "", pickRateChangeTime: "", concentration: "Concentration" }}
        onPatch={onPatch} onApply={vi.fn()} onConfirmTime={vi.fn()} onDismiss={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "mL/hr" } })
    expect(onPatch).toHaveBeenLastCalledWith({ rate: 5.3, unit: "mL/hr", doseUnit: "mcg/kg/min" })
  })
})

describe("RateChangeDialog Other (2026-10-18)", () => {
  const typed: RateChangeState = {
    ...state, name: "Norepinephrine / Noradrenaline", rateMin: 0, rateMax: 3,
    ruleUnit: "mcg/kg/min", weightKg: 70, customOpen: true, concentration: undefined,
  }
  it("opens the syringe sliders and waits for a usable syringe", () => {
    const onPatch = vi.fn()
    render(
      <RateChangeDialog
        state={typed} displayName="Noradrenaline" concentrations={undefined} offerSyringes
        weightBasis={null} hours={[]} minutes={[]}
        labels={{ setNewRatePrompt: "", pickRateChangeTime: "", concentration: "Concentration" }}
        onPatch={onPatch} onApply={vi.fn()} onConfirmTime={vi.fn()} onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByTestId("syringe-custom-fields")).toBeTruthy()
    // The prefilled 4 mg/50 mL is reported as the new strength.
    expect(onPatch).toHaveBeenCalledWith({ concentration: "4 mg/50 mL" })
    // Until the parent takes it, the change waits.
    expect(screen.getByRole("button", { name: "Start now" })).toHaveProperty("disabled", true)
  })
})

describe("RateChangeDialog with no rate (2026-10-18)", () => {
  it("says why, and holds both Start now and Pick time", () => {
    render(
      <RateChangeDialog
        state={{ ...state, rate: 0 }} displayName="Noradrenaline" concentrations={undefined}
        weightBasis={null} hours={[]} minutes={[]}
        labels={{ setNewRatePrompt: "", pickRateChangeTime: "", concentration: "Concentration" }}
        onPatch={vi.fn()} onApply={vi.fn()} onConfirmTime={vi.fn()} onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByRole("alert").textContent).toMatch(/rate above 0/)
    expect(screen.getByRole("button", { name: "Start now" })).toHaveProperty("disabled", true)
    expect(screen.getByRole("button", { name: "Pick time" })).toHaveProperty("disabled", true)
  })
})
