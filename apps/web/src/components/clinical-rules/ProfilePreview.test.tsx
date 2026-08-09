// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// Same approach as the clinical-rules page test: the component reads the locale
// through next-intl, which has no provider in a unit test.
vi.mock("next-intl", () => ({ useLocale: () => "en" }))

import { resolveDrugSelectionSurface } from "@lospor/core/drug-selection"
import type { DoseProfile } from "@lospor/core/catalog"
import { ProfilePreview } from "./ProfilePreview"

const propofol: DoseProfile = {
  kind: "bolus",
  mode: "dose",
  rounding: "nearest_step",
  quickValues: [50, 100, 150],
  routes: ["IV"],
  defaultRoute: "IV",
  weightBasis: "none",
  routeModes: {
    IV: {
      mode: "dose",
      min: 0,
      max: 500,
      step: 10,
      quickValues: [50, 100, 150],
      unit: "mg",
      doseCalc: { perKg: 2, basis: "TBW", roundTo: 10 },
    },
  },
} as unknown as DoseProfile

describe("ProfilePreview", () => {
  it("renders the same surface the intraop widget resolves for the profile", () => {
    // The guarantee: the preview must never drift from runtime behaviour.
    const surface = resolveDrugSelectionSurface({
      profile: propofol,
      route: "IV",
      patient: {
        totalBodyWeightKg: 70,
        idealBodyWeightKg: 70,
        bodySurfaceAreaM2: Math.sqrt((70 * 170) / 3600),
      },
      allowWeightBasisFallback: true,
    })

    render(<ProfilePreview profile={propofol} route="IV" onEdit={vi.fn()} />)

    // Slider bounds and step come straight from the resolved surface.
    expect(screen.getByText(`${surface.min} – ${surface.max} ${surface.unit} · step ${surface.step}`)).toBeTruthy()
    // 2 mg/kg on a 70 kg sample patient = 140 mg, shown as a real number.
    // It appears twice by design: as the autofill summary and as the slider's start value.
    expect(surface.dose).toBe("140")
    expect(screen.getAllByText(/140 mg/).length).toBeGreaterThan(0)
    // Every configured quick-dose pill is offered.
    for (const value of surface.quickValues) {
      expect(screen.getByRole("button", { name: `${value} ${surface.unit}` })).toBeTruthy()
    }
  })

  it("recalculates the autofill when the sample patient weight changes", () => {
    render(<ProfilePreview profile={propofol} route="IV" onEdit={vi.fn()} />)
    expect(screen.getAllByText(/140 mg/).length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText("Sample patient weight in kilograms"), {
      target: { value: "12" },
    })

    // 2 mg/kg on a 12 kg child = 24 mg, but this profile rounds to 10 mg, so the
    // clinician is shown 20 mg. Surfacing that rounding effect is the point of the preview.
    expect(screen.getAllByText(/20 mg/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/140 mg/)).toBeNull()
  })

  it("asks the parent to open the matching form fields when a region is clicked", () => {
    const onEdit = vi.fn()
    render(<ProfilePreview profile={propofol} route="IV" onEdit={onEdit} />)

    fireEvent.click(screen.getByRole("button", { name: "Edit Slider" }))
    expect(onEdit).toHaveBeenCalledWith("slider")

    fireEvent.click(screen.getByRole("button", { name: "Edit Quick doses" }))
    expect(onEdit).toHaveBeenCalledWith("quick")

    fireEvent.click(screen.getByRole("button", { name: "Edit Unit" }))
    expect(onEdit).toHaveBeenCalledWith("unit")
  })
})
