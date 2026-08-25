import { describe, expect, it } from "vitest"
import { DEFAULT_INF, buildDrugFlyoutState, buildFluidFlyoutState, type DrugFlyoutInputs } from "./flyout-state"
import { createDoseSurfaces } from "./dose-surfaces"
import type { DoseProfile } from "@lospor/core/catalog"
import type { AdultDoseProfileRule } from "@lospor/core/clinical-rules"

/**
 * What appears in the quick-entry box when a cell is tapped.
 *
 * Whatever opens here is what gets accepted at 2am, so the cases below are the
 * ways it can open wrong: a drug a rule has withdrawn opening anyway with a
 * generic dose, a paediatric box that can be nudged with a slider when it was
 * meant to be typed by hand, a rate range borrowed from the wrong place, or an
 * audit trail crediting the adult rule when a paediatric one produced the
 * number.
 */

const anchor = { top: 10, bottom: 30, left: 40, right: 120, width: 80 }

function doseProfile(over: Partial<DoseProfile> = {}): DoseProfile {
  return {
    kind: "bolus",
    mode: "dose",
    rounding: "nearest_step",
    quickValues: [],
    routes: ["IV"],
    weightBasis: "none",
    ...over,
  }
}

function adultRule(over: Partial<AdultDoseProfileRule> & { itemKey: string }): AdultDoseProfileRule {
  return {
    ruleKey: `rule.${over.itemKey}`,
    ruleVersion: "1",
    labelEn: over.itemKey,
    labelBg: null,
    category: null,
    kind: "ADULT_DRUG_PROFILE",
    profile: doseProfile(),
    unit: null,
    routeUnits: {},
    availability: "AUTO",
    origin: "PLATFORM",
    presetId: "preset",
    ...over,
  }
}

function realSurfaces(over: Parameters<typeof createDoseSurfaces>[0] extends infer T ? Partial<T> : never = {}) {
  return createDoseSurfaces({
    guidanceEnabled: true,
    isPediatric: false,
    pediatricAge: null,
    ibw: 60,
    tbw: 80,
    patientHeightCm: 170,
    patientSex: "MALE",
    pediatricDrugProfiles: [],
    pediatricFluidProfiles: [],
    pediatricInfusionProfiles: [],
    adultDoseProfiles: [],
    drugOptions: [],
    bolusDoses: {},
    bolusConfigs: {},
    bolusRouteProfiles: {},
    infusionRouteProfiles: {},
    fluidConfigs: {},
    fluidQuickVolumes: {},
    fluidRoutes: {},
    fluidConcentrations: {},
    fluidDefaultConcentrations: {},
    manualDoseOnlyHint: "Enter by hand",
    ...over,
  })
}

/** Only the parts of the dose layer a given flyout case actually consults. */
function stubSurfaces(over: Partial<DrugFlyoutInputs["surfaces"]>): DrugFlyoutInputs["surfaces"] {
  return { ...realSurfaces(), ...over }
}

function drugFlyout(over: Partial<DrugFlyoutInputs> = {}) {
  return buildDrugFlyoutState({
    guidanceEnabled: true,
    col: 3,
    name: "Propofol",
    unit: "mg",
    mode: "bolus",
    anchor,
    surfaces: realSurfaces(),
    isPediatric: false,
    ibw: 60,
    tbw: 80,
    infusionConfigs: {},
    infusionRoutes: {},
    drugRoutes: {},
    quickDoses: {},
    quickRates: {},
    preset: { id: null, version: null, scope: null },
    ...over,
  })
}

describe("a withdrawn drug does not open a flyout at all", () => {
  it("returns nothing when an adult rule hides the drug", () => {
    const result = drugFlyout({
      surfaces: realSurfaces({
        adultDoseProfiles: [adultRule({ itemKey: "Propofol", availability: "HIDDEN" })],
      }),
    })

    expect(result).toBeNull()
  })

  it("returns nothing when a paediatric rule hides the drug", () => {
    const result = drugFlyout({
      isPediatric: true,
      surfaces: stubSurfaces({
        pediatricProfilesFor: () => ([{ availability: "HIDDEN" }] as never),
      }),
    })

    // Not an empty flyout, and not a generic one: no flyout.
    expect(result).toBeNull()
  })

  it("returns nothing when a paediatric rule hides the infusion", () => {
    const result = drugFlyout({
      mode: "infusion",
      isPediatric: true,
      surfaces: stubSurfaces({
        clinicalPediatricInfusionFor: () => ({
          rule: null,
          surface: { disposition: "HIDDEN" } as never,
          conflict: false,
        }),
      }),
    })

    expect(result).toBeNull()
  })

  it("still opens for a drug that is merely unknown, so it can be recorded by hand", () => {
    expect(drugFlyout({ name: "Something unlisted" })).not.toBeNull()
  })

  it("opens an explicitly searched hidden drug without any dosing guidance", () => {
    const result = drugFlyout({
      manualOnlyOverride: true,
      drugRoutes: { Propofol: ["IV", "IO"] },
      quickDoses: { Propofol: [50, 100, 200] },
      surfaces: realSurfaces({
        adultDoseProfiles: [adultRule({
          itemKey: "Propofol",
          availability: "HIDDEN",
          profile: doseProfile({ doseCalc: { perKg: 2, basis: "TBW" } }),
        })],
      }),
      preset: { id: "preset-hidden", version: 7, scope: "INSTITUTION" },
    })

    expect(result).toMatchObject({
      dose: "",
      manualEntryOnly: true,
      searchOnlyManualEntry: true,
      calculationUnavailableReason: "NO_AUTOFILL",
      clinicalRuleKey: "rule.Propofol",
      clinicalRuleVersion: "1",
      clinicalPresetId: "preset-hidden",
      routes: ["IV", "IO"],
    })
    expect(result?.quickDoses).toBeUndefined()
    expect(result?.doseHint).toBe("")
    expect(result?.calculationBasis).toBeUndefined()
    expect(result?.concentrationOptions).toBeUndefined()
  })
})

describe("an adult bolus opens on its profile", () => {
  it("takes the dose, unit and route from the matching rule", () => {
    const flyout = drugFlyout({
      surfaces: realSurfaces({
        adultDoseProfiles: [adultRule({
          itemKey: "Propofol",
          profile: doseProfile({
            unit: "mg",
            routes: ["IV"],
            defaultRoute: "IV",
            weightBasis: "TBW",
            doseCalc: { perKg: 2, basis: "TBW" },
          }),
        })],
      }),
    })

    expect(flyout?.unit).toBe("mg")
    expect(flyout?.route).toBe("IV")
    // 2 mg/kg against the 80 kg patient.
    expect(flyout?.dose).toBe("160")
    expect(flyout?.calculationBasis).toBe("TBW")
    expect(flyout?.calculationWeightKg).toBe(80)
    expect(flyout?.clinicalRuleKey).toBe("rule.Propofol")
  })

  it("opens empty, with a reason, when the rule withholds autofill", () => {
    const flyout = drugFlyout({
      surfaces: realSurfaces({
        adultDoseProfiles: [adultRule({
          itemKey: "Propofol",
          availability: "MANUAL",
          profile: doseProfile({ unit: "mg", doseCalc: { perKg: 2, basis: "TBW" }, weightBasis: "TBW" }),
        })],
      }),
    })

    expect(flyout?.dose).toBe("")
    expect(flyout?.calculationUnavailableReason).toBe("NO_AUTOFILL")
  })

  it("falls back to IV when nothing declares a route", () => {
    expect(drugFlyout({ name: "Unlisted" })?.routes).toEqual(["IV"])
  })

  it("uses the library's routes for a drug with no rule", () => {
    const flyout = drugFlyout({ name: "Ketamine", drugRoutes: { Ketamine: ["IV", "IM"] } })

    expect(flyout?.routes).toEqual(["IV", "IM"])
    expect(flyout?.route).toBe("IV")
  })
})

describe("a paediatric bolus is typed, not nudged", () => {
  it("defaults to manual entry when no single profile resolves", () => {
    const flyout = drugFlyout({
      isPediatric: true,
      surfaces: stubSurfaces({ pediatricProfilesFor: () => [] }),
    })

    // Two profiles, or none, must not leave a slider the dose can drift on.
    expect(flyout?.manualEntryOnly).toBe(true)
    expect(flyout?.dose).toBe("")
  })

  it("offers no adult quick doses to a child", () => {
    const flyout = drugFlyout({
      isPediatric: true,
      quickDoses: { Propofol: [50, 100, 200] },
      surfaces: stubSurfaces({ pediatricProfilesFor: () => [] }),
    })

    expect(flyout?.quickDoses).toBeUndefined()
  })
})

describe("infusion rate bounds come from the most specific source available", () => {
  const config = { units: ["mcg/kg/min"], min: 1, max: 20, step: 0.5, color: "#123456", suggestedRate: 5 }

  it("uses the infusion's own configuration when there is one", () => {
    const flyout = drugFlyout({
      mode: "infusion",
      name: "Noradrenaline",
      infusionConfigs: { Noradrenaline: config },
    })

    expect(flyout?.rate).toBe(5)
    expect(flyout?.rateUnit).toBe("mcg/kg/min")
    expect(flyout?.rateMin).toBe(1)
    expect(flyout?.rateMax).toBe(20)
    expect(flyout?.color).toBe("#123456")
  })

  it("prefers the route's surface over the flat configuration", () => {
    const flyout = drugFlyout({
      mode: "infusion",
      name: "Noradrenaline",
      infusionConfigs: { Noradrenaline: config },
      infusionRoutes: { Noradrenaline: ["IV"] },
      surfaces: stubSurfaces({
        infusionRouteSurface: () => ({
          unit: "ml/hr", min: 0, max: 99, step: 1, quickValues: [], suggestedRate: 7,
        } as never),
      }),
    })

    expect(flyout?.rate).toBe(7)
    expect(flyout?.rateUnit).toBe("ml/hr")
    expect(flyout?.rateMax).toBe(99)
  })

  it("falls back to the shared default for an infusion nothing describes", () => {
    const flyout = drugFlyout({ mode: "infusion", name: "Unlisted" })

    expect(flyout?.rateMin).toBe(DEFAULT_INF.min)
    expect(flyout?.rateMax).toBe(DEFAULT_INF.max)
    expect(flyout?.rateStep).toBe(DEFAULT_INF.step)
    expect(flyout?.rateUnits).toEqual(DEFAULT_INF.units)
    expect(flyout?.color).toBe(DEFAULT_INF.color)
  })

  it("widens the rate range for a child rather than borrowing the adult one", () => {
    const flyout = drugFlyout({
      mode: "infusion",
      name: "Noradrenaline",
      isPediatric: true,
      infusionConfigs: { Noradrenaline: config },
      surfaces: stubSurfaces({
        clinicalPediatricInfusionFor: () => ({ rule: null, surface: null, conflict: false }),
      }),
    })

    expect(flyout?.rate).toBe(0)
    expect(flyout?.rateMin).toBe(0)
    expect(flyout?.rateMax).toBe(100000)
    expect(flyout?.rateStep).toBe(0.1)
  })
})

describe("the preset is credited only when it is fully identified", () => {
  it("records the preset when id, version and scope are all present", () => {
    const flyout = drugFlyout({
      preset: { id: "preset-1", version: 4, scope: "INSTITUTION" },
    })

    expect(flyout).toMatchObject({
      clinicalPresetId: "preset-1",
      clinicalPresetVersion: 4,
      clinicalPresetScope: "INSTITUTION",
    })
  })

  it("records nothing when the version is missing", () => {
    const flyout = drugFlyout({
      preset: { id: "preset-1", version: null, scope: "INSTITUTION" },
    })

    expect(flyout?.clinicalPresetId).toBeUndefined()
    expect(flyout?.clinicalPresetScope).toBeUndefined()
  })
})

describe("the fluid flyout", () => {
  function fluidFlyout(over: Partial<Parameters<typeof buildFluidFlyoutState>[0]> = {}) {
    return buildFluidFlyoutState({
      guidanceEnabled: true,
      col: 2,
      name: "Ringer",
      category: "Crystalloid",
      anchor,
      surfaces: realSurfaces(),
      clinicalMode: "ADULT",
      ibw: 60,
      tbw: 80,
      fluidColor: () => "#fallback",
      preset: { id: null, version: null, scope: null },
      ...over,
    })
  }

  it("opens as a fluid, with a usable bag range for a fluid nothing describes", () => {
    const flyout = fluidFlyout({ name: "Unlisted fluid" })

    expect(flyout.mode).toBe("fluid")
    expect(flyout.fluidBagMax).toBe(2000)
    expect(flyout.unit).toBe("mL")
  })

  it("carries the conflict forward instead of quietly choosing a profile", () => {
    const flyout = fluidFlyout({
      surfaces: realSurfaces({
        adultDoseProfiles: [
          adultRule({ itemKey: "Ringer", kind: "ADULT_FLUID_PROFILE", ruleKey: "a" }),
          adultRule({ itemKey: "Ringer", kind: "ADULT_FLUID_PROFILE", ruleKey: "b" }),
        ],
      }),
    })

    expect(flyout.fluidProfileConflict).toBe(true)
  })

  it("falls back to the fluid's own colour when its category has none", () => {
    expect(fluidFlyout({ category: "Not a known category" }).color).toBe("#fallback")
  })
})

describe("the runtime-baseline boundary", () => {
  it("opens an adult drug as route-preserving manual entry without library fallbacks", () => {
    const result = drugFlyout({
      guidanceEnabled: false,
      mode: "infusion",
      name: "Noradrenaline",
      unit: "mcg/kg/min",
      infusionConfigs: {
        Noradrenaline: {
          units: ["mcg/kg/min"],
          min: 1,
          max: 20,
          step: 0.5,
          color: "#123456",
          suggestedRate: 5,
        },
      },
      infusionRoutes: { Noradrenaline: ["IV", "IO"] },
      quickRates: { Noradrenaline: [2, 5, 10] },
    })

    expect(result).toMatchObject({
      name: "Noradrenaline",
      routes: ["IV", "IO"],
      dose: "",
      rate: 0,
      rateMin: 0,
      rateMax: 100_000,
      rateStep: 0.1,
      quickRates: [],
      manualEntryOnly: true,
      calculationUnavailableReason: "NO_AUTOFILL",
    })
    expect(result?.concentration).toBeUndefined()
  })

  it("does not run pediatric fluid maintenance guidance or bag defaults", () => {
    const result = buildFluidFlyoutState({
      guidanceEnabled: false,
      col: 2,
      name: "Ringer",
      category: "Crystalloids",
      anchor,
      surfaces: realSurfaces({
        guidanceEnabled: false,
        isPediatric: true,
        fluidConfigs: {
          Ringer: { min: 100, max: 2_000, step: 100, unit: "mL", suggestedVolume: 500 },
        },
        fluidQuickVolumes: { Ringer: [250, 500, 1_000] },
        fluidConcentrations: { Ringer: ["0.9%"] },
      }),
      clinicalMode: "PEDIATRIC",
      ibw: 20,
      tbw: 20,
      fluidColor: () => "#fallback",
      preset: { id: "bad", version: 0, scope: "INSTITUTION" },
    })

    expect(result).toMatchObject({
      dose: "",
      fluidEntryMode: "VOLUME",
      fluidEntryModes: ["VOLUME"],
      fluidRate: "",
      quickDoses: [],
      fluidConcentrations: [],
      manualEntryOnly: true,
    })
    expect(result.concentration).toBeUndefined()
  })
})
