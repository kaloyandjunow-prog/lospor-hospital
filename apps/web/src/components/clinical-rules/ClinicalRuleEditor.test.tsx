// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// DoseProfileEditor reads the locale through next-intl, which has no provider here.
vi.mock("next-intl", () => ({ useLocale: () => "en" }))

import { ClinicalRuleEditor, type ClinicalRuleEditorCopy } from "./ClinicalRuleEditor"

const copy = Object.fromEntries([
  "drug", "drugProfile", "drugPolicy", "fluidProfile", "infusionProfile", "medication", "fluid", "infusion", "indication", "route", "ageMin", "ageMax",
  "basis", "amountPerUnit", "flatAmount", "minimumAmount", "maximumAmount",
  "roundTo", "doseUnit", "drugCategory", "fluidCategory", "infusionCategory", "infusionDisposition",
  "manualUnit", "profileEnabled", "manualEntryOnly", "routineSuggestion", "advisory",
  "minimumWeight", "maximumWeight", "minimumWeightInclusive", "maximumWeightInclusive", "labelEn", "labelBg",
  "disposition", "reviewStatus", "rationaleEn", "rationaleBg",
  "save", "cancel", "invalid",
].map(key => [key, key])) as unknown as ClinicalRuleEditorCopy

const atropineProfile = {
  kind: "PEDIATRIC_DRUG_PROFILE" as const,
  medicationKey: "Atropine",
  labelEn: "Atropine",
  labelBg: "Атропин",
  inn: "atropine",
  category: "Anticholinergics",
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 6574,
  profile: {
    kind: "bolus" as const,
    mode: "dose" as const,
    min: 0,
    max: 2,
    step: 0.1,
    rounding: "nearest_step" as const,
    quickValues: [0.1, 0.2, 0.5, 1],
    unit: "mg",
    routes: ["IV"],
    defaultRoute: "IV",
    weightBasis: "TBW" as const,
    doseCalc: { perKg: 0.01, basis: "TBW" as const, roundTo: 0.1 },
  },
  unit: null,
  routeUnits: {},
}

const plasmaLyteProfile = {
  kind: "PEDIATRIC_FLUID_PROFILE" as const,
  itemKey: "PLASMA_LYTE",
  labelEn: "Plasma-Lyte",
  labelBg: "Plasma-Lyte",
  category: "Crystalloids",
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 6574,
  profile: {
    kind: "fluid" as const,
    mode: "dose" as const,
    min: 0,
    max: 2_000,
    step: 50,
    rounding: "nearest_step" as const,
    quickValues: [250, 500, 1_000],
    unit: "mL",
    routes: ["IV"],
    defaultRoute: "IV",
    weightBasis: "none" as const,
    fluidEntryModes: ["VOLUME", "RATE"] as ("VOLUME" | "RATE")[],
    defaultFluidEntryMode: "RATE" as const,
    fluidRate: {
      min: 2,
      max: 150,
      step: 2,
      allowManualOutsideRange: false,
      calculation: "HOLLIDAY_SEGAR_4_2_1" as const,
    },
  },
  unit: null,
  routeUnits: {},
}

describe("ClinicalRuleEditor", () => {
  it("offers profile, policy, fluid and infusion rules but neither equipment nor the retired dose kind", () => {
    render(
      <ClinicalRuleEditor
        drugOptions={[]}
        copy={copy}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )

    // PEDIATRIC_DRUG_DOSE was a second way to state a paediatric dose, outside
    // the reach of the authoring scope guard. The server rejects it now, so
    // offering it here would only produce an error on save.
    expect(screen.queryByRole("button", { name: "drug" })).toBeNull()
    expect(screen.getByRole("button", { name: "drugProfile" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "drugPolicy" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "fluidProfile" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "infusionProfile" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /equipment/i })).toBeNull()
  })

  it("reopens and submits an age-banded pediatric infusion surface", () => {
    const onSubmit = vi.fn()
    render(
      <ClinicalRuleEditor
        initial={{
          kind: "PEDIATRIC_INFUSION_PROFILE",
          itemKey: "Propofol",
          labelEn: "Propofol",
          labelBg: "Propofol",
          category: "Anaesthesia",
          disposition: "AUTO",
          routeDispositions: {},
          manualEntryOnly: false,
          routeManualEntryOnly: {},
          profile: {
            kind: "infusion",
            mode: "rate",
            min: 0,
            max: 15,
            step: 0.5,
            rounding: "nearest_step",
            quickValues: [6, 8, 10, 12, 15],
            unit: "mg/kg/hr",
            routes: ["IV"],
            defaultRoute: "IV",
            weightBasis: "TBW",
            suggestedRate: 10,
          },
          unit: null,
          routeUnits: {},
          manualUnit: null,
          minimumAgeDays: 28,
          maximumAgeDaysExclusive: 6574,
          minimumWeightKg: null,
          minimumWeightInclusive: true,
          maximumWeightKg: null,
          maximumWeightInclusive: false,
          routineSuggestion: true,
          advisory: "Anaesthesia maintenance profile.",
        }}
        lockIdentity
        drugOptions={[]}
        infusionOptions={[]}
        copy={copy}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    )

    expect((screen.getByLabelText("infusion") as HTMLSelectElement).value).toBe("Propofol")
    expect((screen.getAllByLabelText("infusionDisposition")[0] as HTMLSelectElement).value).toBe("AUTO")
    expect((screen.getByLabelText("profileEnabled") as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "save" }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      kind: "PEDIATRIC_INFUSION_PROFILE",
      itemKey: "Propofol",
      disposition: "AUTO",
      profile: expect.objectContaining({ suggestedRate: 10, unit: "mg/kg/hr" }),
    }))
  })

  it("locks medication and age-band identity while exposing a structured profile", () => {
    render(
      <ClinicalRuleEditor
        initial={atropineProfile}
        lockIdentity
        drugOptions={[]}
        copy={copy}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )

    expect((screen.getByLabelText("medication") as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByLabelText("ageMin") as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText("ageMax") as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByRole("tab", { name: "IV · mg · default" })).toBeTruthy()
    expect(screen.getByText("Advanced profile (read only)")).toBeTruthy()
    expect(screen.queryByRole("textbox", { name: /advanced profile/i })).toBeNull()
  })

  it("submits the canonical pediatric drug profile through structured fields", () => {
    const onSubmit = vi.fn()
    render(
      <ClinicalRuleEditor
        initial={atropineProfile}
        lockIdentity
        drugOptions={[]}
        copy={copy}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Quick-dose pills/), {
      target: { value: "0.1, 0.2, 0.5, 1.5" },
    })
    fireEvent.click(screen.getByRole("button", { name: "save" }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      kind: "PEDIATRIC_DRUG_PROFILE",
      profile: expect.objectContaining({
        routeModes: expect.objectContaining({
          IV: expect.objectContaining({ quickValues: [0.1, 0.2, 0.5, 1.5] }),
        }),
      }),
    }))
  })

  it("edits a non-runtime pediatric drug policy without age or dose fields", () => {
    const onSubmit = vi.fn()
    const policy = {
      kind: "PEDIATRIC_DRUG_POLICY" as const,
      medicationKey: "Propofol",
      labelEn: "Propofol",
      labelBg: "Propofol",
      inn: "propofol",
      category: "Intravenous hypnotics",
      disposition: "MANUAL_NO_PROFILE" as const,
      reviewStatus: "EVIDENCE_REVIEWED" as const,
      rationaleEn: "The IV route has materially different pediatric regimens.",
      rationaleBg: null,
    }

    render(
      <ClinicalRuleEditor
        initial={policy}
        lockIdentity
        drugOptions={[]}
        copy={copy}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    )

    expect(screen.queryByLabelText("ageMin")).toBeNull()
    expect(screen.queryByText("Advanced profile (read only)")).toBeNull()
    fireEvent.change(screen.getByLabelText("disposition"), { target: { value: "SCHEMA_BLOCKED" } })
    fireEvent.click(screen.getByRole("button", { name: "save" }))

    expect(onSubmit).toHaveBeenCalledWith({ ...policy, disposition: "SCHEMA_BLOCKED" })
  })

  it("reopens and submits an existing pediatric fluid profile without converting it to a drug", () => {
    const onSubmit = vi.fn()
    render(
      <ClinicalRuleEditor
        initial={plasmaLyteProfile}
        lockIdentity
        drugOptions={[]}
        fluidOptions={[]}
        copy={copy}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    )

    expect((screen.getByLabelText("fluid") as HTMLSelectElement).value).toBe("PLASMA_LYTE")
    expect((screen.getByLabelText("fluid") as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByLabelText("ageMin") as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText("ageMax") as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText("fluidCategory") as HTMLInputElement).value).toBe("Crystalloids")
    expect(screen.getByRole("button", { name: "Rate" }).getAttribute("aria-pressed")).toBe("true")
    expect((screen.getByLabelText("Default fluid entry") as HTMLSelectElement).value).toBe("RATE")
    expect((screen.getByLabelText("Rate autofill calculation") as HTMLSelectElement).value)
      .toBe("HOLLIDAY_SEGAR_4_2_1")

    fireEvent.change(screen.getByLabelText(/Quick-dose pills/), {
      target: { value: "100, 250, 500" },
    })
    fireEvent.click(screen.getByRole("button", { name: "save" }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      kind: "PEDIATRIC_FLUID_PROFILE",
      itemKey: "PLASMA_LYTE",
      profile: expect.objectContaining({
        kind: "fluid",
        fluidEntryModes: ["VOLUME", "RATE"],
        defaultFluidEntryMode: "RATE",
        fluidRate: {
          min: 1,
          max: 200,
          step: 1,
          allowManualOutsideRange: true,
          calculation: "HOLLIDAY_SEGAR_4_2_1",
        },
        routeModes: expect.objectContaining({
          IV: expect.objectContaining({ quickValues: [100, 250, 500] }),
        }),
      }),
    }))
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty("medicationKey")
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty("inn")
  })

  it("creates a pediatric fluid profile from the fluid catalog with Rate and 4/2/1 defaults", () => {
    const onSubmit = vi.fn()
    render(
      <ClinicalRuleEditor
        drugOptions={[]}
        fluidOptions={[{
          value: "PLASMA_LYTE",
          label: "Plasma-Lyte",
          labelBg: "Plasma-Lyte",
          group: "Crystalloids",
        }]}
        copy={copy}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "fluidProfile" }))
    fireEvent.change(screen.getByLabelText("fluid"), { target: { value: "PLASMA_LYTE" } })
    fireEvent.change(screen.getByLabelText("ageMin"), { target: { value: "0" } })
    fireEvent.change(screen.getByLabelText("ageMax"), { target: { value: "6574" } })

    expect((screen.getByLabelText("fluidCategory") as HTMLInputElement).value).toBe("Crystalloids")
    expect((screen.getByLabelText("Default fluid entry") as HTMLSelectElement).value).toBe("RATE")
    fireEvent.click(screen.getByRole("button", { name: "save" }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      kind: "PEDIATRIC_FLUID_PROFILE",
      itemKey: "PLASMA_LYTE",
      labelEn: "Plasma-Lyte",
      category: "Crystalloids",
      profile: expect.objectContaining({
        kind: "fluid",
        defaultFluidEntryMode: "RATE",
        fluidRate: expect.objectContaining({
          min: 1,
          max: 200,
          step: 1,
          allowManualOutsideRange: true,
          calculation: "HOLLIDAY_SEGAR_4_2_1",
        }),
      }),
    }))
  })

  it("keeps blood products on Bag-only entry when creating a fluid profile", () => {
    render(
      <ClinicalRuleEditor
        drugOptions={[]}
        fluidOptions={[{
          value: "PRBC",
          label: "Packed red blood cells (PRBC)",
          group: "Blood products",
        }]}
        copy={copy}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "fluidProfile" }))
    fireEvent.change(screen.getByLabelText("fluid"), { target: { value: "PRBC" } })

    expect(screen.getByRole("button", { name: "Bag" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: "Rate" }).getAttribute("aria-pressed")).toBe("false")
    expect((screen.getByLabelText("Default fluid entry") as HTMLSelectElement).value).toBe("VOLUME")
    expect((screen.getByLabelText("Rate autofill calculation") as HTMLSelectElement).disabled).toBe(true)
  })

  it("keeps special-dose fluids in Rate mode without a 4/2/1 default", () => {
    render(
      <ClinicalRuleEditor
        drugOptions={[]}
        fluidOptions={[{
          value: "MANNITOL",
          label: "Mannitol",
          group: "Other",
        }]}
        copy={copy}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "fluidProfile" }))
    fireEvent.change(screen.getByLabelText("fluid"), { target: { value: "MANNITOL" } })

    expect(screen.getByRole("button", { name: "Rate" }).getAttribute("aria-pressed")).toBe("true")
    expect((screen.getByLabelText("Default fluid entry") as HTMLSelectElement).value).toBe("RATE")
    expect((screen.getByLabelText("Rate autofill calculation") as HTMLSelectElement).value).toBe("")
  })
})
