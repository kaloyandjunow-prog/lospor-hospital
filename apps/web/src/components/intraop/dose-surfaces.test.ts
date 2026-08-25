import { describe, expect, it } from "vitest"
import { createDoseSurfaces, type DoseSurfaceInputs } from "./dose-surfaces"
import type { DoseProfile } from "@lospor/core/catalog"
import type { AdultDoseProfileRule } from "@lospor/core/clinical-rules"

/**
 * The dose the chart puts in front of an anaesthetist.
 *
 * Nothing here is about layout. Each case is a way the suggestion can be wrong
 * in a manner nobody would notice by looking at the screen: an adult dose
 * offered for a child, a number produced from a profile that was never meant to
 * apply, a weight recorded in the audit trail that the calculation did not
 * actually use. The rule throughout is that an empty box is a safe answer and a
 * confident wrong number is not.
 *
 * `createDoseSurfaces` uses no React state, so it is called directly.
 */

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

function surfaces(over: Partial<DoseSurfaceInputs> = {}) {
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
    manualDoseOnlyHint: "Paediatric doses are entered by hand",
    ...over,
  })
}

describe("paediatric mode never falls back to an adult dose", () => {
  it("refuses to suggest a dose and says why", () => {
    const { calcSuggestedDose } = surfaces({
      isPediatric: true,
      pediatricAge: { value: 4, unit: "YEARS" },
      tbw: 16,
      // A weight-based adult rule is present and would otherwise produce a number.
      bolusDoses: { Propofol: { perKg: 2, basis: "TBW", hint: "2 mg/kg" } },
    })

    const result = calcSuggestedDose("Propofol", 16, 16)

    expect(result.dose).toBe("")
    expect(result.hint).toBe("Paediatric doses are entered by hand")
  })

  it("gives the adult patient the same drug's calculated dose", () => {
    const { calcSuggestedDose } = surfaces({
      bolusDoses: { Propofol: { perKg: 2, basis: "TBW", hint: "2 mg/kg" } },
    })

    // 2 mg/kg against 80 kg total body weight.
    expect(calcSuggestedDose("Propofol", 60, 80).dose).toBe("160")
  })
})

describe("ambiguity is reported, never resolved by guessing", () => {
  it("returns a conflict rather than picking one of two matching fluid profiles", () => {
    const { clinicalFluidProfileFor } = surfaces({
      adultDoseProfiles: [
        adultRule({ itemKey: "Ringer", kind: "ADULT_FLUID_PROFILE", ruleKey: "a" }),
        adultRule({ itemKey: "Ringer", kind: "ADULT_FLUID_PROFILE", ruleKey: "b" }),
      ],
    })

    const result = clinicalFluidProfileFor("Ringer")

    expect(result.conflict).toBe(true)
    expect(result.profile).toBeNull()
    // No rule is credited either, so nothing false reaches the audit trail.
    expect(result.clinicalRuleKey).toBeUndefined()
  })

  it("uses the profile when exactly one matches, and records which rule it was", () => {
    const { clinicalFluidProfileFor } = surfaces({
      adultDoseProfiles: [
        adultRule({
          itemKey: "Ringer",
          kind: "ADULT_FLUID_PROFILE",
          ruleKey: "fluid.ringer",
          ruleVersion: "3",
          profile: doseProfile({ kind: "fluid", min: 0, max: 1000, step: 250 }),
        }),
      ],
    })

    const result = clinicalFluidProfileFor("Ringer")

    expect(result.conflict).toBe(false)
    expect(result.profile?.max).toBe(1000)
    expect(result.clinicalRuleKey).toBe("fluid.ringer")
    expect(result.clinicalRuleVersion).toBe("3")
  })

  it("matches a rule by its label as well as its key, ignoring case and spacing", () => {
    const { adultRuleFor } = surfaces({
      adultDoseProfiles: [adultRule({ itemKey: "PROPOFOL", labelEn: "Propofol" })],
    })

    expect(adultRuleFor(" propofol ")?.itemKey).toBe("PROPOFOL")
  })
})

describe("a hidden or manual drug offers no number", () => {
  it("ignores a HIDDEN rule entirely", () => {
    const { adultRuleFor } = surfaces({
      adultDoseProfiles: [adultRule({ itemKey: "Propofol", availability: "HIDDEN" })],
    })

    expect(adultRuleFor("Propofol")).toBeUndefined()
  })

  it("clears the dose on a MANUAL rule and says autofill was withheld", () => {
    const { adultBolusSurface } = surfaces({
      adultDoseProfiles: [adultRule({
        itemKey: "Propofol",
        availability: "MANUAL",
        profile: doseProfile({ unit: "mg", doseCalc: { perKg: 2, basis: "TBW" }, weightBasis: "TBW" }),
      })],
    })

    const surface = adultBolusSurface("Propofol")

    expect(surface?.dose).toBe("")
    expect(surface?.calculation).toBeUndefined()
    expect(surface?.calculationUnavailableReason).toBe("NO_AUTOFILL")
  })

  it("locks a LOCAL rule to one route and withholds autofill", () => {
    const { adultBolusSurface } = surfaces({
      adultDoseProfiles: [adultRule({
        itemKey: "Lidocaine",
        availability: "LOCAL",
        profile: doseProfile({ unit: "mg", routes: ["INFILTRATION"], defaultRoute: "INFILTRATION" }),
      })],
    })

    const surface = adultBolusSurface("Lidocaine")

    expect(surface?.routes).toHaveLength(1)
    expect(surface?.dose).toBe("")
    expect(surface?.calculationUnavailableReason).toBe("NO_AUTOFILL")
  })

  it("returns nothing at all for a drug with neither a rule nor a library entry", () => {
    expect(surfaces().adultBolusSurface("Nonexistent")).toBeNull()
  })
})

describe("the audit trail records only the weight the calculation used", () => {
  it("keeps the weight for a weight-based calculation", () => {
    const { calculationAuditFromSurface } = surfaces()

    const audit = calculationAuditFromSurface({
      calculation: { basis: "TBW", calculationWeight: 80 },
    } as Parameters<typeof calculationAuditFromSurface>[0])

    expect(audit.calculationBasis).toBe("TBW")
    expect(audit.calculationWeightKg).toBe(80)
    expect(audit.calculationMethod).toBe("TOTAL_BODY_WEIGHT")
  })

  it("drops the weight for a body-surface-area calculation", () => {
    const { calculationAuditFromSurface } = surfaces()

    const audit = calculationAuditFromSurface({
      // A weight can be present on the surface without having been the basis;
      // recording it would misstate how the dose was reached.
      calculation: { basis: "BSA_M2", calculationWeight: 80 },
    } as Parameters<typeof calculationAuditFromSurface>[0])

    expect(audit.calculationWeightKg).toBeUndefined()
    expect(audit.calculationMethod).toBe("MOSTELLER_BSA_M2")
  })

  it("names a flat dose as flat rather than leaving the method blank", () => {
    const { calculationAuditFromSurface } = surfaces()

    const audit = calculationAuditFromSurface({
      calculation: { basis: "FLAT" },
    } as Parameters<typeof calculationAuditFromSurface>[0])

    expect(audit.calculationMethod).toBe("PROFILE_FLAT")
    expect(audit.calculationWeightKg).toBeUndefined()
  })

  it("credits the rule alongside the calculation", () => {
    const { adultDoseAudit } = surfaces({
      adultDoseProfiles: [adultRule({ itemKey: "Propofol", ruleKey: "drug.propofol", ruleVersion: "7" })],
    })

    const audit = adultDoseAudit("Propofol", {
      calculation: { basis: "TBW", calculationWeight: 80 },
    } as Parameters<typeof adultDoseAudit>[1])

    expect(audit).toMatchObject({
      clinicalRuleKey: "drug.propofol",
      clinicalRuleVersion: "7",
      calculationBasis: "TBW",
    })
  })
})

describe("dose ranges widen for children", () => {
  it("allows a much smaller step and a much larger ceiling in paediatric mode", () => {
    const paediatric = surfaces({ isPediatric: true, pediatricAge: { value: 2, unit: "YEARS" } })
    const adult = surfaces()

    // A 2-year-old's dose can be a fraction of a milligram; a 5 mg adult step
    // cannot express it.
    expect(paediatric.bolusRange("Propofol", "mg").step).toBe(0.1)
    expect(adult.bolusRange("Propofol", "mg").step).toBe(5)
    expect(paediatric.bolusRange("Fentanyl", "mcg").max).toBeGreaterThan(
      adult.bolusRange("Fentanyl", "mcg").max,
    )
  })

  it("prefers the drug's own configured range over the unit default for an adult", () => {
    const { bolusRange } = surfaces({
      bolusConfigs: { Propofol: { min: 0, max: 400, step: 10 } },
    })

    expect(bolusRange("Propofol", "mg")).toEqual({ min: 0, max: 400, step: 10 })
  })

  it("ignores a configured adult range in paediatric mode", () => {
    const { bolusRange } = surfaces({
      isPediatric: true,
      pediatricAge: { value: 2, unit: "YEARS" },
      bolusConfigs: { Propofol: { min: 0, max: 400, step: 10 } },
    })

    expect(bolusRange("Propofol", "mg").step).toBe(0.1)
  })
})

describe("per-route surfaces", () => {
  it("finds the route profile under a differently spelled but equivalent route", () => {
    const { bolusRouteSurface } = surfaces({
      bolusRouteProfiles: {
        Ketamine: { "intravenous": { unit: "mg", min: 0, max: 200, step: 5, quickValues: [] } },
      },
    })

    // The chart holds the canonical "IV"; the profile was authored as
    // "intravenous". Missing the match would silently drop the route's range.
    expect(bolusRouteSurface("Ketamine", "IV")).toBeDefined()
  })

  it("returns nothing when no route is asked for", () => {
    const { bolusRouteSurface, infusionRouteSurface } = surfaces()

    expect(bolusRouteSurface("Ketamine")).toBeUndefined()
    expect(infusionRouteSurface("Propofol")).toBeUndefined()
  })

  it("returns nothing for a drug that has no route profiles", () => {
    expect(surfaces().bolusRouteSurface("Ketamine", "IV")).toBeUndefined()
  })
})

describe("infusions and fluids outside paediatric mode", () => {
  it("reports no paediatric infusion rule for an adult", () => {
    const { clinicalPediatricInfusionFor } = surfaces()

    expect(clinicalPediatricInfusionFor("Propofol", "IV")).toEqual({
      rule: null,
      surface: null,
      conflict: false,
    })
  })

  it("falls back to a usable fluid range when the fluid has no config at all", () => {
    const { fluidDoseSurface } = surfaces()

    const { surface } = fluidDoseSurface("Unknown fluid", "IV")

    expect(surface.max).toBe(2000)
    expect(surface.unit).toBe("mL")
  })
})

describe("an unavailable governed baseline fails closed", () => {
  it("keeps routes and hidden-state lookup but strips every prospective fallback", () => {
    const result = surfaces({
      guidanceEnabled: false,
      adultDoseProfiles: [adultRule({
        itemKey: "Propofol",
        profile: doseProfile({
          unit: "mg",
          routes: ["IV", "IM"],
          defaultRoute: "IV",
          quickValues: [50, 100],
          doseCalc: { perKg: 2, basis: "TBW" },
          concentrationOptions: ["10 mg/mL"],
        }),
      })],
      bolusDoses: { Propofol: { perKg: 2, basis: "TBW", hint: "2 mg/kg" } },
      bolusConfigs: { Propofol: { min: 10, max: 400, step: 10 } },
      fluidConfigs: {
        Ringer: { min: 100, max: 2_000, step: 100, unit: "mL", suggestedVolume: 500 },
      },
      fluidQuickVolumes: { Ringer: [250, 500, 1_000] },
      fluidRoutes: { Ringer: ["IV", "IO"] },
      fluidConcentrations: { Ringer: ["0.9%"] },
      fluidDefaultConcentrations: { Ringer: "0.9%" },
    })

    expect(result.adultBolusSurface("Propofol")).toMatchObject({
      routes: ["IV", "IM"],
      dose: "",
      quickValues: [],
      concentrationOptions: [],
      concentration: "",
      calculationUnavailableReason: "NO_AUTOFILL",
    })
    expect(result.calcSuggestedDose("Propofol", 60, 80)).toEqual({ dose: "", hint: "" })
    expect(result.bolusRange("Propofol", "mg")).toEqual({ min: 0, max: 100_000, step: 0.1 })
    expect(result.fluidDoseSurface("Ringer").surface).toMatchObject({
      routes: ["IV", "IO"],
      suggestedVolume: 0,
      quickValues: [],
      concentrationOptions: [],
      min: 0,
      max: 100_000,
      step: 0.1,
    })
    expect(result.fluidDoseSurface("Ringer").surface.defaultConcentration).toBeUndefined()
  })

  it("still exposes a hidden rule to the picker enforcement layer", () => {
    const result = surfaces({
      guidanceEnabled: false,
      adultDoseProfiles: [adultRule({ itemKey: "Propofol", availability: "HIDDEN" })],
    })

    expect(result.adultRuleForAny("Propofol")?.availability).toBe("HIDDEN")
    expect(result.adultRuleFor("Propofol")).toBeUndefined()
  })
})
