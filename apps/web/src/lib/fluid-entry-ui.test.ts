import { describe, expect, it } from "vitest"
import {
  currentFluidRate,
  fluidClinicalRuleAudit,
  fluidDeliveredVolumeMl,
  resolveFluidDoseSelectorSurface,
  resolveFluidSelectorDefaults,
  selectApplicablePediatricFluidProfile,
} from "./fluid-entry-ui"
import type { DoseProfile } from "@lospor/core/catalog"
import type { PediatricFluidProfileRule } from "@lospor/core/clinical-rules"

const authoredFluidProfile = {
  kind: "fluid",
  mode: "dose",
  min: 10,
  max: 900,
  step: 10,
  rounding: "nearest_step",
  quickValues: [100, 300],
  unit: "mL",
  routes: ["IV"],
  defaultRoute: "IV",
  concentrationOptions: ["0.9%"],
  defaultConcentration: "0.9%",
  weightBasis: "none",
  suggestedVolume: 300,
  fluidEntryModes: ["VOLUME"],
  defaultFluidEntryMode: "VOLUME",
  fluidRate: { min: 2, max: 150, step: 2, allowManualOutsideRange: true },
} satisfies DoseProfile

function pediatricFluidRule(ruleKey: string): PediatricFluidProfileRule {
  return {
    ruleKey,
    ruleVersion: "1",
    itemKey: "PLASMA_LYTE",
    labelEn: "Plasma-Lyte",
    labelBg: null,
    category: "Crystalloids",
    minimumAgeDays: 0,
    maximumAgeDaysExclusive: 18 * 365.2425,
    profile: authoredFluidProfile,
    unit: null,
    routeUnits: {},
    sourceIds: [ruleKey],
    origin: "PLATFORM",
    presetId: "pediatric",
  }
}

describe("fluid selector defaults", () => {
  it("keeps adult fluid entry on the existing volume mode", () => {
    const defaults = resolveFluidSelectorDefaults({
      clinicalMode: "ADULT",
      name: "Plasma-Lyte",
      category: "Crystalloids",
      totalBodyWeightKg: 70,
    })

    expect(defaults.defaultMode).toBe("VOLUME")
    expect(defaults.availableModes).toEqual(["VOLUME", "RATE"])
    expect(defaults.rate).toBe("")
  })

  it("defaults pediatric maintenance fluid to a rounded 4/2/1 rate", () => {
    const defaults = resolveFluidSelectorDefaults({
      clinicalMode: "PEDIATRIC",
      name: "Plasma-Lyte",
      category: "Crystalloids",
      totalBodyWeightKg: 25,
      mclarenIdealBodyWeightKg: 20,
    })

    expect(defaults.defaultMode).toBe("RATE")
    expect(defaults.rate).toBe("70")
    expect(defaults.rateProfile).toMatchObject({ min: 1, max: 200, step: 1 })
    expect(defaults.rateHint).toContain("TBW 25 kg")
  })

  it("opens special-dose pediatric fluid in rate mode without 4/2/1 autofill", () => {
    const defaults = resolveFluidSelectorDefaults({
      clinicalMode: "PEDIATRIC",
      name: "Mannitol",
      category: "Other",
      totalBodyWeightKg: 25,
    })

    expect(defaults.defaultMode).toBe("RATE")
    expect(defaults.rate).toBe("")
    expect(defaults.rateHint).toBeUndefined()
  })

  it("suppresses maintenance autofill for hypertonic saline", () => {
    const defaults = resolveFluidSelectorDefaults({
      clinicalMode: "PEDIATRIC",
      name: "Saline",
      category: "Crystalloids",
      concentration: "3%",
      totalBodyWeightKg: 25,
    })

    expect(defaults.defaultMode).toBe("RATE")
    expect(defaults.rate).toBe("")
    expect(defaults.rateHint).toBeUndefined()
  })

  it("forces blood products to volume mode", () => {
    const defaults = resolveFluidSelectorDefaults({
      clinicalMode: "PEDIATRIC",
      name: "Packed red blood cells (PRBC)",
      category: "Blood products",
      totalBodyWeightKg: 10,
    })

    expect(defaults.defaultMode).toBe("VOLUME")
    expect(defaults.availableModes).toEqual(["VOLUME"])
  })

  it("applies an authored fluid profile to modes, rate limits, and bag surface", () => {
    const defaults = resolveFluidSelectorDefaults({
      clinicalMode: "PEDIATRIC",
      name: "Plasma-Lyte",
      category: "Crystalloids",
      totalBodyWeightKg: 25,
      profile: authoredFluidProfile,
    })
    const surface = resolveFluidDoseSelectorSurface({
      profile: authoredFluidProfile,
      fallback: {
        min: 0,
        max: 2_000,
        step: 50,
        quickValues: [250, 500],
        unit: "mL",
        routes: ["IV"],
        concentrationOptions: [],
      },
    })

    expect(defaults.availableModes).toEqual(["VOLUME"])
    expect(defaults.defaultMode).toBe("VOLUME")
    expect(defaults.rateProfile).toMatchObject({
      min: 1,
      max: 200,
      step: 1,
      allowManualOutsideRange: true,
    })
    expect(surface).toMatchObject({
      min: 10,
      max: 900,
      step: 10,
      quickValues: [100, 300],
      suggestedVolume: 300,
      concentrationOptions: ["0.9%"],
      defaultConcentration: "0.9%",
    })
  })

  it("uses a route-specific authored bag default", () => {
    const surface = resolveFluidDoseSelectorSurface({
      profile: {
        ...authoredFluidProfile,
        routes: ["IV", "IO"],
        suggestedVolumeByRoute: { IO: 120 },
      },
      route: "IO",
      fallback: {
        min: 0,
        max: 2_000,
        step: 50,
        quickValues: [250, 500],
        unit: "mL",
        routes: ["IV"],
        concentrationOptions: [],
      },
    })

    expect(surface.route).toBe("IO")
    expect(surface.suggestedVolume).toBe(120)
  })

  it("does not silently select overlapping pediatric fluid profiles", () => {
    const selection = selectApplicablePediatricFluidProfile({
      itemKey: "Plasma-Lyte",
      age: { value: 5, unit: "YEARS" },
      profiles: [pediatricFluidRule("fluid-a"), pediatricFluidRule("fluid-b")],
    })

    expect(selection.profile).toBeNull()
    expect(selection.applicableCount).toBe(2)
    expect(selection.conflict).toBe(true)
  })

  it("selects the one age-applicable pediatric fluid profile", () => {
    const selection = selectApplicablePediatricFluidProfile({
      itemKey: "Plasma-Lyte",
      age: { value: 5, unit: "YEARS" },
      profiles: [pediatricFluidRule("fluid-a")],
    })

    expect(selection.profile?.ruleKey).toBe("fluid-a")
    expect(selection.applicableCount).toBe(1)
    expect(selection.conflict).toBe(false)
  })
})

describe("fluid clinical-rule audit", () => {
  it("copies the unique rule and effective preset provenance", () => {
    const sourceIds = ["preset:pediatric", "rule:fluid-a"]
    const audit = fluidClinicalRuleAudit({
      ruleKey: "PEDIATRIC_FLUID_PROFILE:PLASMA_LYTE:0-6574",
      ruleVersion: "1",
      sourceIds,
      presetId: "pediatric",
      presetVersion: 4,
      presetScope: "INSTITUTION",
    })

    expect(audit).toEqual({
      clinicalRuleKey: "PEDIATRIC_FLUID_PROFILE:PLASMA_LYTE:0-6574",
      clinicalRuleVersion: "1",
      clinicalRuleSourceIds: sourceIds,
      clinicalPresetId: "pediatric",
      clinicalPresetVersion: 4,
      clinicalPresetScope: "INSTITUTION",
    })
    expect(audit.clinicalRuleSourceIds).not.toBe(sourceIds)
  })
})

describe("fluid delivered volume", () => {
  it("integrates rate changes by exact timestamps without adding the bag volume", () => {
    const fluid = {
      id: "fluid-1",
      name: "Plasma-Lyte",
      category: "Crystalloids",
      color: "#06b6d4",
      startCol: 0,
      endCol: 12,
      volume: "0",
      fluidEntryMode: "RATE" as const,
      rate: 60,
      unit: "mL/h",
      startTs: "2026-08-02T08:00:00.000Z",
      rateChanges: [{ col: 6, ts: "2026-08-02T08:30:00.000Z", rate: 120, unit: "mL/h" }],
    }

    expect(fluidDeliveredVolumeMl(fluid, "2026-08-02T09:00:00.000Z")).toBe(90)
    expect(currentFluidRate(fluid)).toBe(120)
  })

  it("uses an actual administered-volume override", () => {
    const fluid = {
      id: "fluid-2",
      name: "Saline",
      category: "Crystalloids",
      color: "#06b6d4",
      startCol: 0,
      endCol: 1,
      volume: "175",
      fluidEntryMode: "VOLUME" as const,
      bagVolumeMl: 500,
      administeredVolumeMl: 175,
    }

    expect(fluidDeliveredVolumeMl(fluid)).toBe(175)
  })
})
