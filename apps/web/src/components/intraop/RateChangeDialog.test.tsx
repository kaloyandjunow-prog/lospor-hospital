// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
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
