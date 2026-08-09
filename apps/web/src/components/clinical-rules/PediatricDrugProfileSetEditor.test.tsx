// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// DoseProfileEditor reads the locale through next-intl, which has no provider here.
vi.mock("next-intl", () => ({ useLocale: () => "en" }))

import type { ClinicalPresetRule } from "@lospor/core/clinical-rules"
import { PediatricDrugProfileSetEditor } from "./PediatricDrugProfileSetEditor"

vi.mock("./DoseProfileEditor", () => ({
  DoseProfileEditor: ({ profile }: { profile: { unit?: string } }) => (
    <div data-testid="dose-profile-editor">{profile.unit ?? "no unit"}</div>
  ),
  doseProfileEditorIssues: () => [],
}))

const profile = {
  kind: "bolus" as const,
  mode: "dose" as const,
  min: 0,
  max: 3,
  step: 0.01,
  rounding: "nearest_step" as const,
  quickValues: [0.1, 0.2, 0.5],
  unit: "mg",
  routes: ["IV"],
  defaultRoute: "IV",
  weightBasis: "IBW" as const,
  doseCalc: {
    perKg: 0.01,
    basis: "IBW" as const,
    roundTo: 0.01,
    cap: 0.6,
    capAtActualWeight: true,
  },
}

function rule(
  id: string,
  payload: ClinicalPresetRule["payload"],
): ClinicalPresetRule {
  return {
    id,
    ruleKey: id,
    ruleVersion: "PEDIATRIC.v2.draft1",
    payload,
    sourceRefs: [],
  }
}

describe("PediatricDrugProfileSetEditor", () => {
  it("edits all age/weight bands for one drug and submits them atomically", () => {
    const onSubmit = vi.fn()
    const rules = [
      rule("atropine-young", {
        kind: "PEDIATRIC_DRUG_PROFILE",
        medicationKey: "Atropine",
        labelEn: "Atropine",
        labelBg: "Atropine",
        inn: null,
        category: "Antimuscarinics",
        availability: "AUTO",
        minimumAgeDays: 0,
        maximumAgeDaysExclusive: 365.2425,
        minimumWeightKg: null,
        minimumWeightInclusive: true,
        maximumWeightKg: null,
        maximumWeightInclusive: false,
        manualUnit: "mg",
        profile,
        unit: null,
        routeUnits: {},
      }),
      rule("atropine-older", {
        kind: "PEDIATRIC_DRUG_PROFILE",
        medicationKey: "Atropine",
        labelEn: "Atropine",
        labelBg: "Atropine",
        inn: null,
        category: "Antimuscarinics",
        availability: "LOCAL",
        minimumAgeDays: 365.2425,
        maximumAgeDaysExclusive: 18 * 365.2425,
        minimumWeightKg: null,
        minimumWeightInclusive: true,
        maximumWeightKg: null,
        maximumWeightInclusive: false,
        manualUnit: "mg",
        profile: null,
        unit: null,
        routeUnits: {},
      }),
    ]

    render(
      <PediatricDrugProfileSetEditor
        rules={rules}
        drugOptions={[{ value: "Atropine", label: "Atropine", labelBg: "Atropine" }]}
        busy={false}
        lockIdentity
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByText("Band 1")).toBeTruthy()
    expect(screen.getByText("Band 2")).toBeTruthy()
    expect(screen.getByTestId("dose-profile-editor").textContent).toBe("mg")
    expect(screen.getAllByRole("button", { name: "AUTO" })[0]?.getAttribute("aria-pressed")).toBe("true")
    expect(screen.getAllByRole("button", { name: "LOCAL" })[1]?.getAttribute("aria-pressed")).toBe("true")

    fireEvent.click(screen.getByRole("button", { name: "Save drug profile" }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith(
      "Atropine",
      expect.arrayContaining([
        expect.objectContaining({ availability: "AUTO", profile: expect.objectContaining({ unit: "mg" }) }),
        expect.objectContaining({ availability: "LOCAL", profile: null, manualUnit: "mg" }),
      ]),
    )
  })

  it("converts a legacy policy-only drug into the unified status model", () => {
    const onSubmit = vi.fn()
    render(
      <PediatricDrugProfileSetEditor
        rules={[rule("legacy-policy", {
          kind: "PEDIATRIC_DRUG_POLICY",
          medicationKey: "Vancomycin",
          labelEn: "Vancomycin",
          labelBg: "Vancomycin",
          inn: null,
          category: "Antimicrobials often given intraoperatively",
          disposition: "FORMULARY_REQUIRED",
          reviewStatus: "APPROVED",
          rationaleEn: "Institution protocol required.",
          rationaleBg: null,
        })]}
        drugOptions={[{ value: "Vancomycin", label: "Vancomycin", labelBg: "Vancomycin" }]}
        busy={false}
        lockIdentity
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByRole("button", { name: "LOCAL" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Save drug profile" }))
    expect(onSubmit).toHaveBeenCalledWith(
      "Vancomycin",
      [expect.objectContaining({ availability: "LOCAL", profile: null })],
    )
  })
})
