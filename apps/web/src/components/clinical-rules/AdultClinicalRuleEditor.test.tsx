// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// DoseProfileEditor reads the locale through next-intl, which has no provider here.
vi.mock("next-intl", () => ({ useLocale: () => "en" }))

import type { AdultDoseProfileRulePayload } from "@lospor/core/clinical-rules"
import { AdultClinicalRuleEditor } from "./AdultClinicalRuleEditor"

const lidocaine = {
  kind: "ADULT_DRUG_PROFILE" as const,
  itemKey: "Lidocaine",
  labelEn: "Lidocaine",
  labelBg: null,
  category: "Local anaesthetics",
  profile: {
    kind: "bolus" as const,
    mode: "dose" as const,
    rounding: "nearest_step" as const,
    quickValues: [],
    routes: ["IV", "INFILTRATION"],
    defaultRoute: "IV",
    weightBasis: "none" as const,
    routeModes: {
      IV: {
        mode: "dose" as const,
        min: 0,
        max: 500,
        step: 10,
        quickValues: [50, 100, 150],
        unit: "mg",
        weightBasis: "none" as const,
        doseCalc: { perKg: 1, basis: "IBW" as const, roundTo: 10 },
      },
      INFILTRATION: {
        mode: "concentration" as const,
        min: 0,
        max: 50,
        step: 1,
        quickValues: [2, 5, 10],
        unit: "mL",
        weightBasis: "none" as const,
        concentrationOptions: ["0.5%", "1%", "2%"],
        concentrationUnit: "PERCENT",
        defaultConcentration: "0.5%",
      },
    },
  },
  unit: null,
  routeUnits: {},
}

const adultFluid: AdultDoseProfileRulePayload = {
  kind: "ADULT_FLUID_PROFILE",
  itemKey: "PLASMA_LYTE",
  labelEn: "Plasma-Lyte",
  labelBg: null,
  category: "Crystalloids",
  profile: {
    kind: "fluid",
    mode: "dose",
    min: 0,
    max: 2_000,
    step: 50,
    rounding: "nearest_step",
    quickValues: [250, 500, 1_000],
    unit: "mL",
    routes: ["IV"],
    defaultRoute: "IV",
    weightBasis: "none",
    fluidEntryModes: ["VOLUME", "RATE"],
    defaultFluidEntryMode: "VOLUME",
    fluidRate: {
      min: 5,
      max: 1_000,
      step: 5,
      allowManualOutsideRange: false,
    },
  },
  unit: null,
  routeUnits: {},
}

describe("AdultClinicalRuleEditor", () => {
  it("keeps Lidocaine IV in mg and local routes in mL", () => {
    const onSubmit = vi.fn()
    render(
      <AdultClinicalRuleEditor
        initial={lidocaine}
        busy={false}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByRole("tab", { name: "IV · mg · default" })).toBeTruthy()
    expect((screen.getByLabelText("Amount unit") as HTMLSelectElement).value).toBe("MG")

    fireEvent.click(screen.getByRole("tab", { name: "INFILTRATION · mL" }))
    expect((screen.getByLabelText("Amount unit") as HTMLSelectElement).value).toBe("ML")
    expect((screen.getByLabelText("Concentration unit") as HTMLSelectElement).value).toBe("PERCENT")
    expect((screen.getByLabelText("Preselected concentration") as HTMLSelectElement).value).toBe("0.5%")

    fireEvent.change(screen.getByLabelText(/Quick-dose pills/), { target: { value: "1, 2, 5, 10" } })
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      profile: expect.objectContaining({
        routeModes: expect.objectContaining({
          IV: expect.objectContaining({ unit: "mg" }),
          INFILTRATION: expect.objectContaining({ unit: "mL", quickValues: [1, 2, 5, 10] }),
        }),
      }),
    }))
  })

  it("does not offer an adult equipment policy rule", () => {
    render(
      <AdultClinicalRuleEditor initial={null} busy={false} onSubmit={() => {}} onCancel={() => {}} />,
    )

    expect(screen.queryByRole("button", { name: /equipment/i })).toBeNull()
    expect(screen.getByLabelText("Profile type")).toBeTruthy()
  })

  it("normalizes adult fluid rate metadata to the fixed runtime slider contract", () => {
    const onSubmit = vi.fn()
    render(
      <AdultClinicalRuleEditor
        initial={adultFluid}
        busy={false}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByText(/Rate slider is fixed at 1–200 mL\/h/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      kind: "ADULT_FLUID_PROFILE",
      profile: expect.objectContaining({
        fluidRate: {
          min: 1,
          max: 200,
          step: 1,
          allowManualOutsideRange: true,
        },
      }),
    }))
  })
})
