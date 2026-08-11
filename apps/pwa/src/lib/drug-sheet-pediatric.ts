import {
  applicablePediatricDrugProfiles,
  resolvePediatricDrugProfileSurface,
  selectApplicablePediatricDrugProfile,
  type PediatricDrugProfileRule,
} from "@lospor/core/clinical-rules"
import type { PediatricAgeInput } from "@lospor/core/pediatric"
import type { PediatricDoseProfile } from "@lospor/core/pediatric-dose"
import {
  applicablePediatricDoseProfiles,
  resolvePediatricProfileDose,
} from "@/lib/pediatric-dose-ui"

export type DrugSheetPediatricInput = {
  medicationKey?: string
  age: PediatricAgeInput | null
  weightKg?: number
  heightCm?: number
  sex?: string
  route?: string
  /** The rule the anaesthetist has explicitly chosen, if any. */
  ruleKey?: string
  drugProfiles: readonly PediatricDrugProfileRule[]
  doseProfiles: readonly PediatricDoseProfile[]
}

/**
 * Everything the drug sheet knows about a child and the picked drug, resolved
 * in one place so the sheet only renders it.
 *
 * Overlapping age or weight bands are an authoring mistake, and core decides
 * what to do about it: exactly one applicable profile is used, several are a
 * conflict and none may be used. Taking the first after sorting would offer a
 * dose from a band nobody chose — and the web app would refuse the same case,
 * so the two would disagree about a child.
 *
 * `unresolvedConflict` is what the sheet has to say out loud. An explicitly
 * chosen rule still wins: the conflict is only unresolved while nobody has said
 * which band they meant.
 */
export function resolveDrugSheetPediatric({
  medicationKey, age, weightKg, heightCm, sex, route, ruleKey, drugProfiles, doseProfiles,
}: DrugSheetPediatricInput) {
  const structuredProfiles = medicationKey
    ? applicablePediatricDrugProfiles({ medicationKey, age, weightKg, profiles: drugProfiles })
    : []
  const selection = medicationKey
    ? selectApplicablePediatricDrugProfile({ medicationKey, age, weightKg, profiles: drugProfiles })
    : { profile: null, applicableCount: 0, conflict: false }
  const selectedProfile = structuredProfiles.find(profile => profile.ruleKey === ruleKey)
    ?? selection.profile
  const surface = selectedProfile && age
    ? resolvePediatricDrugProfileSurface({ rule: selectedProfile, age, route, weightKg, heightCm, sex })
    : null
  // Legacy dose profiles remain a read-only fallback for cached snapshots
  // created before PEDIATRIC_DRUG_PROFILE was added to the runtime contract.
  const legacyProfiles = drugProfiles.length === 0 && medicationKey
    ? applicablePediatricDoseProfiles({ medicationKey, age, profiles: doseProfiles })
    : []
  const legacyProfile = legacyProfiles.find(profile => profile.key === ruleKey)
    ?? (legacyProfiles.length === 1 ? legacyProfiles[0] : null)
  const legacyResolution = legacyProfile && age
    ? resolvePediatricProfileDose({ profile: legacyProfile, age, weightKg, heightCm })
    : null
  const amount = legacyResolution?.status === "AVAILABLE"
    ? legacyResolution.amount
    : surface?.dose && Number.isFinite(Number(surface.dose))
      ? Number(surface.dose)
      : null
  return {
    structuredProfiles,
    selectedProfile,
    surface,
    unresolvedConflict: selection.conflict && !selectedProfile,
    legacyProfiles,
    legacyProfile,
    legacyResolution,
    amount,
  }
}

export type DrugSheetPediatric = ReturnType<typeof resolveDrugSheetPediatric>
