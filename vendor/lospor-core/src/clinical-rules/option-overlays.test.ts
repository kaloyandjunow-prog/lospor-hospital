import { describe, expect, it } from "vitest"
import {
  applyAdultDoseProfilesToOptions,
  applyPediatricDrugProfilesToOptions,
  applyPediatricInfusionProfilesToOptions,
  isClinicalRuleConflicted,
  isClinicalRuleHidden,
  visibleClinicalOptions,
} from "./option-overlays"
import type { AdultDoseProfileRule } from "./adult-profiles"
import type {
  PediatricDrugProfileRule,
  PediatricInfusionProfileRule,
} from "./pediatric-profiles"

/**
 * These overlays decide what a clinician is offered and whether the app will
 * calculate a dose for them, so the cases below are about what reaches the
 * screen rather than about internal shape.
 */

const option = (label: string, extra: Record<string, unknown> = {}) =>
  ({ label, metadata: { unit: "mg" }, ...extra })

const adultRule = (over: Partial<AdultDoseProfileRule> = {}): AdultDoseProfileRule => ({
  ruleKey: "adult.propofol",
  ruleVersion: "LOSPOR_ADULTS.v2",
  itemKey: "PROPOFOL",
  labelEn: "Propofol",
  labelBg: null,
  category: null,
  kind: "ADULT_DRUG_PROFILE",
  profile: { unit: "mg", routes: ["IV"] } as AdultDoseProfileRule["profile"],
  unit: null,
  routeUnits: {},
  availability: "AUTO",
  origin: "PLATFORM",
  presetId: "lospor-adults-v2",
  ...over,
})

const pedDrugRule = (over: Partial<PediatricDrugProfileRule> = {}): PediatricDrugProfileRule => ({
  ruleKey: "ped.propofol",
  ruleVersion: "LOSPOR_PEDIATRICS.v2",
  medicationKey: "PROPOFOL",
  labelEn: "Propofol",
  labelBg: null,
  inn: null,
  category: null,
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 6570,
  availability: "AUTO",
  profile: { unit: "mg", routes: ["IV"] } as PediatricDrugProfileRule["profile"],
  unit: null,
  routeUnits: {},
  sourceIds: [],
  origin: "PLATFORM",
  presetId: "lospor-pediatrics-v2",
  ...over,
})

const pedInfusionRule = (
  over: Partial<PediatricInfusionProfileRule> = {},
): PediatricInfusionProfileRule => ({
  ruleKey: "ped.inf.noradrenaline",
  ruleVersion: "LOSPOR_PEDIATRICS.v2",
  itemKey: "NORADRENALINE",
  labelEn: "Noradrenaline",
  labelBg: null,
  category: null,
  disposition: "AUTO",
  routeDispositions: {},
  manualEntryOnly: false,
  routeManualEntryOnly: {},
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 6570,
  minimumWeightKg: null,
  minimumWeightInclusive: true,
  maximumWeightKg: null,
  maximumWeightInclusive: false,
  routineSuggestion: false,
  advisory: null,
  profile: { unit: "mcg/kg/min", routes: ["IV"] } as PediatricInfusionProfileRule["profile"],
  unit: null,
  routeUnits: {},
  manualUnit: null,
  sourceIds: [],
  origin: "PLATFORM",
  presetId: "lospor-pediatrics-v2",
  ...over,
})

const infant = { value: 6, unit: "MONTHS" as const }

describe("applyAdultDoseProfilesToOptions", () => {
  it("merges the ruleset profile onto a matching option", () => {
    const [result] = applyAdultDoseProfilesToOptions(
      [option("Propofol")],
      [adultRule()],
      "ADULT_DRUG_PROFILE",
    )
    const meta = result.metadata as Record<string, unknown>
    expect(meta.clinicalRuleAvailability).toBe("AUTO")
    expect(meta.routes).toEqual(["IV"])
    expect(meta.manualEntryOnly).toBe(false)
  })

  it("matches on the option value as well as the label, ignoring case and padding", () => {
    const results = applyAdultDoseProfilesToOptions(
      [{ label: "Диприван", value: "  propofol  ", metadata: {} }],
      [adultRule()],
      "ADULT_DRUG_PROFILE",
    )
    expect((results[0].metadata as Record<string, unknown>).clinicalRuleAvailability).toBe("AUTO")
  })

  it("leaves options with no matching rule untouched", () => {
    const input = [option("Ketamine")]
    const [result] = applyAdultDoseProfilesToOptions(input, [adultRule()], "ADULT_DRUG_PROFILE")
    expect(result).toBe(input[0])
  })

  it("ignores rules belonging to a different kind", () => {
    const input = [option("Propofol")]
    const [result] = applyAdultDoseProfilesToOptions(input, [adultRule()], "ADULT_FLUID_PROFILE")
    expect(result).toBe(input[0])
  })

  it("strips autofill for MANUAL, so the app never suggests a dose it was told not to", () => {
    const [result] = applyAdultDoseProfilesToOptions(
      [option("Propofol", { metadata: { doseCalc: { basis: "TBW" } } })],
      [adultRule({ availability: "MANUAL" })],
      "ADULT_DRUG_PROFILE",
    )
    const meta = result.metadata as Record<string, unknown>
    expect(meta.doseCalc).toBeUndefined()
    expect(meta.doseCalcByRoute).toEqual({})
    expect(meta.manualEntryOnly).toBe(false)
  })

  it("marks LOCAL as manual entry only", () => {
    const [result] = applyAdultDoseProfilesToOptions(
      [option("Propofol")],
      [adultRule({ availability: "LOCAL" })],
      "ADULT_DRUG_PROFILE",
    )
    expect((result.metadata as Record<string, unknown>).manualEntryOnly).toBe(true)
  })

  it("marks a HIDDEN option and keeps it in the list", () => {
    // Matches the pediatric overlays. These lists are the lookup source for
    // units, routes and concentrations, so removing an entry would leave a drug
    // already recorded on a case unresolvable and take it out of search. Only
    // visibleClinicalOptions trims the picker.
    const results = applyAdultDoseProfilesToOptions(
      [option("Propofol"), option("Ketamine")],
      [adultRule({ availability: "HIDDEN" })],
      "ADULT_DRUG_PROFILE",
    )
    expect(results.map(r => r.label)).toEqual(["Propofol", "Ketamine"])
    expect(isClinicalRuleHidden(results[0])).toBe(true)
    expect(isClinicalRuleHidden(results[1])).toBe(false)
    expect(visibleClinicalOptions(results).map(r => r.label)).toEqual(["Ketamine"])
  })

  it("keeps a hidden option fully resolvable, so a recorded dose still renders", () => {
    // The reason marking beats dropping: the profile must still merge, or a
    // fluid or drug given earlier in the case loses its unit and routes.
    const [result] = applyAdultDoseProfilesToOptions(
      [option("Propofol")],
      [adultRule({ availability: "HIDDEN" })],
      "ADULT_DRUG_PROFILE",
    )
    const meta = result.metadata as Record<string, unknown>
    expect(meta.routes).toEqual(["IV"])
    expect(meta.unit).toBe("mg")
  })
})

describe("applyPediatricDrugProfilesToOptions", () => {
  it("keeps hidden options in the list and only marks them", () => {
    // The invariant that makes hiding safe. A hidden drug must still resolve
    // its unit, code and colour for a case where it was already given, and must
    // still be reachable by search so a clinician is never blocked from
    // documenting what they actually administered. Only the default picker is
    // trimmed, by visibleClinicalOptions.
    const results = applyPediatricDrugProfilesToOptions(
      [option("Propofol"), option("Ketamine")],
      [pedDrugRule({ availability: "HIDDEN" })],
      infant,
    )
    expect(results.map(r => r.label)).toEqual(["Propofol", "Ketamine"])
    expect(isClinicalRuleHidden(results[0])).toBe(true)
    expect(isClinicalRuleHidden(results[1])).toBe(false)
    expect(visibleClinicalOptions(results).map(r => r.label)).toEqual(["Ketamine"])
  })

  it("returns the options untouched when there is no patient age to band on", () => {
    const input = [option("Propofol")]
    const results = applyPediatricDrugProfilesToOptions(input, [pedDrugRule()], null)
    expect(results).toEqual(input)
  })

  it("does not apply a rule whose age band excludes the patient", () => {
    const results = applyPediatricDrugProfilesToOptions(
      [option("Propofol")],
      [pedDrugRule({ minimumAgeDays: 3650, maximumAgeDaysExclusive: 6570 })],
      infant,
    )
    expect((results[0].metadata as Record<string, unknown>).clinicalRuleAvailability).toBeUndefined()
  })

  it("refuses to choose when two bands claim the child, and borrows nothing from either", () => {
    // Overlapping bands are an authoring mistake, and the mistake reaches a
    // hospital before it reaches anyone who can spot it. Taking the first band
    // after sorting would put a real, in-range dose on the screen that nobody
    // authored for this child — and a different one on the other device if its
    // rule order differed. So: no dose, and the reason stated.
    const results = applyPediatricDrugProfilesToOptions(
      [option("Propofol", { metadata: { unit: "mg", doseCalc: { basis: "TBW" } } })],
      [
        pedDrugRule({ ruleKey: "ped.propofol.infant", maximumAgeDaysExclusive: 365 }),
        pedDrugRule({
          ruleKey: "ped.propofol.wide",
          profile: { unit: "WRONG", routes: ["PO"] } as PediatricDrugProfileRule["profile"],
        }),
      ],
      infant,
    )
    const meta = results[0].metadata as Record<string, unknown>
    expect(isClinicalRuleConflicted(results[0])).toBe(true)
    expect(meta.unit).toBe("mg")
    expect(meta.routes).toBeUndefined()
    expect(meta.clinicalRuleAvailability).toBeUndefined()
    expect(meta.doseCalc).toBeUndefined()
    expect(meta.manualEntryOnly).toBe(true)
    // Still offered: the drug exists and may well have been given. Only the
    // suggestion is withdrawn.
    expect(visibleClinicalOptions(results)).toHaveLength(1)
  })

  it("treats a conflict across the option's label and value as a conflict too", () => {
    // An option is looked up by both keys, so two different bands can claim it
    // without either one of them being ambiguous on its own.
    const results = applyPediatricDrugProfilesToOptions(
      [{ label: "Diprivan", value: "Propofol", metadata: { unit: "mg" } }],
      [
        pedDrugRule({ ruleKey: "ped.by-label", medicationKey: "DIPRIVAN", labelEn: "Diprivan" }),
        pedDrugRule({ ruleKey: "ped.by-value" }),
      ],
      infant,
    )
    expect(isClinicalRuleConflicted(results[0])).toBe(true)
  })

  it("does not mistake one band found through both keys for two bands", () => {
    // The same rule, reached by its medicationKey and by its labelEn. That is
    // one band seen twice, and refusing here would withdraw autofill from every
    // option whose rule is named after it.
    const results = applyPediatricDrugProfilesToOptions(
      [{ label: "Diprivan", value: "Propofol", metadata: { unit: "mg" } }],
      [pedDrugRule({ labelEn: "Diprivan" })],
      infant,
    )
    expect(isClinicalRuleConflicted(results[0])).toBe(false)
    expect((results[0].metadata as Record<string, unknown>).clinicalRuleAvailability).toBe("AUTO")
  })
})

describe("applyPediatricInfusionProfilesToOptions", () => {
  it("marks a hidden infusion rather than dropping it", () => {
    const results = applyPediatricInfusionProfilesToOptions(
      [option("Noradrenaline"), option("Adrenaline")],
      [pedInfusionRule({ disposition: "HIDDEN" })],
      infant,
    )
    expect(results).toHaveLength(2)
    expect(isClinicalRuleHidden(results[0])).toBe(true)
    expect(visibleClinicalOptions(results).map(r => r.label)).toEqual(["Adrenaline"])
  })

  it("strips autofill for MANUAL", () => {
    const [result] = applyPediatricInfusionProfilesToOptions(
      [option("Noradrenaline", { metadata: { doseCalc: { basis: "TBW" } } })],
      [pedInfusionRule({ disposition: "MANUAL" })],
      infant,
    )
    const meta = result.metadata as Record<string, unknown>
    expect(meta.doseCalc).toBeUndefined()
    expect(meta.clinicalRuleAvailability).toBe("MANUAL")
  })

  it("honours manualEntryOnly on the rule even when the disposition is AUTO", () => {
    const [result] = applyPediatricInfusionProfilesToOptions(
      [option("Noradrenaline", { metadata: { doseCalc: { basis: "TBW" } } })],
      [pedInfusionRule({ manualEntryOnly: true })],
      infant,
    )
    const meta = result.metadata as Record<string, unknown>
    expect(meta.manualEntryOnly).toBe(true)
    expect(meta.doseCalc).toBeUndefined()
  })

  it("returns the options untouched when there is no patient age", () => {
    const input = [option("Noradrenaline")]
    expect(applyPediatricInfusionProfilesToOptions(input, [pedInfusionRule()], null)).toEqual(input)
  })

  it("does not apply an infusion rule whose weight band excludes the patient", () => {
    const results = applyPediatricInfusionProfilesToOptions(
      [option("Noradrenaline")],
      [pedInfusionRule({ minimumWeightKg: 20 })],
      infant,
      8,
    )
    expect((results[0].metadata as Record<string, unknown>).clinicalRuleAvailability).toBeUndefined()
  })

  it("refuses to choose when two weight bands overlap on this child", () => {
    // Weight bands overlap at their seam as readily as age bands do — here both
    // claim exactly 10 kg — and a vasopressor rate is the last number that
    // should be decided by rule order.
    const results = applyPediatricInfusionProfilesToOptions(
      [option("Noradrenaline", { metadata: { unit: "mcg/kg/min", doseCalc: { basis: "TBW" } } })],
      [
        pedInfusionRule({
          ruleKey: "ped.inf.light",
          maximumWeightKg: 10,
          maximumWeightInclusive: true,
        }),
        pedInfusionRule({
          ruleKey: "ped.inf.heavy",
          minimumWeightKg: 10,
          minimumWeightInclusive: true,
          profile: { unit: "WRONG", routes: ["IO"] } as PediatricInfusionProfileRule["profile"],
        }),
      ],
      infant,
      10,
    )
    const meta = results[0].metadata as Record<string, unknown>
    expect(isClinicalRuleConflicted(results[0])).toBe(true)
    expect(meta.unit).toBe("mcg/kg/min")
    expect(meta.routes).toBeUndefined()
    expect(meta.clinicalRuleAvailability).toBeUndefined()
    expect(meta.doseCalc).toBeUndefined()
    expect(meta.manualEntryOnly).toBe(true)
  })

  it("applies the band that does claim the child when the other one does not", () => {
    const results = applyPediatricInfusionProfilesToOptions(
      [option("Noradrenaline")],
      [
        pedInfusionRule({ ruleKey: "ped.inf.light", maximumWeightKg: 10 }),
        pedInfusionRule({ ruleKey: "ped.inf.heavy", minimumWeightKg: 10 }),
      ],
      infant,
      10,
    )
    expect(isClinicalRuleConflicted(results[0])).toBe(false)
    expect((results[0].metadata as Record<string, unknown>).clinicalRuleAvailability).toBe("AUTO")
  })
})
