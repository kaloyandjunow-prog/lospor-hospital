import { describe, expect, it } from "vitest"
import * as barrel from "../clinical-rules"
import * as internal from "./internal"

/**
 * `clinical-rules.ts` is a barrel over the modules in this directory, and four
 * repos import from it. Those two facts together are the risk: a re-export
 * dropped during a refactor still typechecks in this package and only fails in
 * a consumer.
 *
 * So the runtime surface is pinned as data. Types are not listed — they erase
 * at runtime and are already covered by `tsc`, which fails here and in every
 * consumer if a type re-export goes missing.
 *
 * If you intentionally add or remove a public export, update this list in the
 * same commit. The diff then records a public API change on purpose, rather
 * than one happening by accident.
 */
const PUBLIC_VALUE_EXPORTS = [
  "CLINICAL_RULE_KINDS",
  "DRUG_PROFILE_AVAILABILITIES",
  "FIXED_EQUIPMENT_RULE_REJECTION_MESSAGE",
  "LEGACY_EQUIPMENT_RULE_KINDS",
  "RETIRED_AUTHORING_RULE_KINDS",
  "RETIRED_DOSE_RULE_REJECTION_MESSAGE",
  "LOSPOR_ADULT_RULESET_KEY",
  "LOSPOR_ADULT_RULESET_NAME",
  "PEDIATRIC_DRUG_POLICY_DISPOSITIONS",
  "PEDIATRIC_DRUG_POLICY_REVIEW_STATUSES",
  "PEDIATRIC_INFUSION_DISPOSITIONS",
  "adultDoseProfilesFromRules",
  "applicablePediatricDoseProfiles",
  "applicablePediatricDrugProfiles",
  "applicablePediatricFluidProfiles",
  "applicablePediatricInfusionProfiles",
  "applyAdultDoseProfilesToOptions",
  "applyPediatricDrugProfilesToOptions",
  "applyPediatricInfusionProfilesToOptions",
  "clinicalPresetRulesToEffective",
  "clinicalRuleKey",
  "createClinicalRulesSnapshotRepository",
  "createLosporAdultRulePayloads",
  "isClinicalRuleConflicted",
  "isClinicalRuleHidden",
  "isLegacyEquipmentRuleKind",
  "isRetiredAuthoringRuleKind",
  "pediatricDoseProfilesFromRules",
  "pediatricDrugProfilesFromRules",
  "pediatricFluidProfilesFromRules",
  "pediatricInfusionProfilesFromRules",
  "resolveEffectiveClinicalRules",
  "selectApplicablePediatricDrugProfile",
  "selectApplicablePediatricFluidProfile",
  "selectApplicablePediatricInfusionProfile",
  "visiblePediatricInfusionRoutes",
  "resolvePediatricDrugProfileSurface",
  "resolvePediatricInfusionProfileSurface",
  "resolvePediatricProfileDose",
  "validateClinicalRuleCollection",
  "validateClinicalRuleCollectionForPublication",
  "validateClinicalRulePayload",
  "visibleClinicalOptions",
]

describe("clinical-rules barrel", () => {
  it("still exports every value the package promises", () => {
    const missing = PUBLIC_VALUE_EXPORTS.filter(name => !(name in barrel))
    expect(missing).toEqual([])
  })

  it("exports nothing beyond the declared surface", () => {
    const extra = Object.keys(barrel).filter(name => !PUBLIC_VALUE_EXPORTS.includes(name))
    expect(extra).toEqual([])
  })

  it("keeps directory internals out of the public surface", () => {
    // internal.ts is shared between sibling modules but must never be reachable
    // through the barrel — that is the whole reason it is a separate file.
    const leaked = Object.keys(internal).filter(name => name in barrel)
    expect(leaked).toEqual([])
  })
})
