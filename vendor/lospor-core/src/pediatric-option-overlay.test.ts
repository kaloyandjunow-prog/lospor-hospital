import { describe, expect, it } from "vitest"
import {
  applyPediatricDrugProfilesToOptions,
  isClinicalRuleHidden,
  visibleClinicalOptions,
  clinicalPresetRulesToEffective,
  clinicalRuleKey,
  pediatricDrugProfilesFromRules,
  validateClinicalRulePayload,
} from "./clinical-rules"

const atropineBase = {
  kind: "PEDIATRIC_DRUG_PROFILE" as const,
  medicationKey: "Atropine",
  labelEn: "Atropine",
  labelBg: "Atropine",
  inn: "atropine",
  category: "Antimuscarinic",
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 18 * 365.2425,
  profile: {
    routes: ["IV"],
    defaultRoute: "IV",
    routeModes: {
      IV: {
        min: 0,
        max: 2,
        step: 0.1,
        unit: "mg",
        quickValues: [0.1, 0.2],
        doseCalc: { perKg: 0.01, basis: "TBW", roundTo: 0.1 },
      },
    },
  },
}

/** Build real PediatricDrugProfileRule objects through the normal pipeline. */
function rulesFor(input: Record<string, unknown>) {
  const parsed = validateClinicalRulePayload({ ...atropineBase, ...input })
  if (!parsed.valid) throw new Error(`fixture invalid: ${JSON.stringify(parsed.issues)}`)
  const effective = clinicalPresetRulesToEffective("preset-1", "PLATFORM", [{
    id: "rule-1",
    ruleKey: clinicalRuleKey(parsed.value),
    ruleVersion: "1.0",
    payload: parsed.value,
    sourceRefs: [],
  }])
  return pediatricDrugProfilesFromRules(effective)
}

const options = [
  { label: "Atropine", value: "Atropine", metadata: { unit: "mg" } },
  { label: "Propofol", value: "Propofol", metadata: { unit: "mg" } },
]
const child = { value: 5, unit: "YEARS" as const }

describe("applyPediatricDrugProfilesToOptions", () => {
  it("marks a HIDDEN pediatric drug without dropping it from the option list", () => {
    const rules = rulesFor({ availability: "HIDDEN", profile: null, manualUnit: "mg" })
    const result = applyPediatricDrugProfilesToOptions(options, rules, child)

    // Still present, so an already-recorded drug keeps its units/codes/colour...
    expect(result.map(option => option.label)).toEqual(["Atropine", "Propofol"])
    expect(isClinicalRuleHidden(result[0]!)).toBe(true)
    expect(isClinicalRuleHidden(result[1]!)).toBe(false)
    // ...but the default picker does not offer it.
    expect(visibleClinicalOptions(result).map(option => option.label)).toEqual(["Propofol"])
  })

  it("keeps an AUTO drug and merges its profile into the option metadata", () => {
    const result = applyPediatricDrugProfilesToOptions(options, rulesFor({}), child)
    expect(result.map(option => option.label)).toEqual(["Atropine", "Propofol"])
    const atropine = result[0]!.metadata as Record<string, unknown>
    expect(atropine.clinicalRuleAvailability).toBe("AUTO")
    expect(atropine.manualEntryOnly).toBe(false)
  })

  it("strips autofill from a MANUAL band so the list does not promise a dose", () => {
    const result = applyPediatricDrugProfilesToOptions(
      options,
      rulesFor({ availability: "MANUAL" }),
      child,
    )
    const atropine = result[0]!.metadata as Record<string, unknown>
    expect(atropine.clinicalRuleAvailability).toBe("MANUAL")
    expect(atropine.doseCalc).toBeUndefined()
    expect(atropine.doseCalcByRoute).toEqual({})
  })

  it("marks a LOCAL band as manual entry only", () => {
    const result = applyPediatricDrugProfilesToOptions(
      options,
      rulesFor({ availability: "LOCAL", profile: null, manualUnit: "mg" }),
      child,
    )
    const atropine = result[0]!.metadata as Record<string, unknown>
    expect(atropine.manualEntryOnly).toBe(true)
  })

  it("leaves options untouched when there is no age (adult mode or age missing)", () => {
    const rules = rulesFor({ availability: "HIDDEN", profile: null, manualUnit: "mg" })
    expect(applyPediatricDrugProfilesToOptions(options, rules, null)).toHaveLength(2)
  })

  it("ignores a band that does not cover this patient's age", () => {
    const neonatalOnly = rulesFor({
      availability: "HIDDEN",
      profile: null,
      manualUnit: "mg",
      minimumAgeDays: 0,
      maximumAgeDaysExclusive: 28,
    })
    // A 5-year-old is outside the 0-28 day band, so nothing is hidden.
    expect(applyPediatricDrugProfilesToOptions(options, neonatalOnly, child)).toHaveLength(2)
  })
})
