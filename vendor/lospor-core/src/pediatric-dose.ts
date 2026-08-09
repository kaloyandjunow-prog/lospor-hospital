import {
  PEDIATRIC_RULESET_VERSION,
  type PediatricAgeInput,
  type PediatricRuleReviewStatus,
  normalizePediatricAge,
} from "./pediatric"
import { roundToPracticalDose } from "./dose-rounding"

export type PediatricDoseBasis = "TBW_KG" | "BSA_M2" | "FLAT"

export type PediatricDoseProfile = {
  key: string
  medicationKey: string
  inn?: string
  indication: string
  route: string
  minimumAgeDays: number
  maximumAgeDaysExclusive: number
  basis: PediatricDoseBasis
  amountPerUnit?: number
  flatAmount?: number
  minimumAmount?: number | null
  maximumAmount?: number | null
  roundTo?: number | null
  doseUnit: string
  sourceIds: string[]
  version: string
  reviewStatus: PediatricRuleReviewStatus
}

export type PediatricDoseRequest = {
  medicationKey: string
  indication: string
  route: string
  age: PediatricAgeInput
  totalBodyWeightKg?: number | null
  bodySurfaceAreaM2?: number | null
}

export type PediatricDoseResolution =
  | {
      status: "AVAILABLE"
      amount: number
      doseUnit: string
      profileKey: string
      profileVersion: string
      sourceIds: string[]
      basis: PediatricDoseBasis
    }
  | {
      status:
        | "NO_REVIEWED_PROFILE"
        | "MISSING_WEIGHT"
        | "MISSING_BSA"
        | "INVALID_AGE"
      manualDocumentationAllowed: true
    }

function clampDose(value: number, profile: PediatricDoseProfile): number {
  let result = value
  if (profile.minimumAmount != null) result = Math.max(result, profile.minimumAmount)
  if (profile.maximumAmount != null) result = Math.min(result, profile.maximumAmount)
  // The rule's own roundTo is honoured only when coarser than practical — see
  // roundToPracticalDose. Paediatric rules inherited roundTo from the slider
  // step, which produced doses like 68 mg of propofol that nobody can draw.
  return roundToPracticalDose(result, profile.roundTo)
}

export function resolvePediatricDoseSuggestion(
  request: PediatricDoseRequest,
  profiles: readonly PediatricDoseProfile[],
): PediatricDoseResolution {
  const age = normalizePediatricAge(request.age)
  if (!age) return { status: "INVALID_AGE", manualDocumentationAllowed: true }
  const profile = profiles.find(candidate =>
    candidate.reviewStatus === "APPROVED"
    && candidate.medicationKey === request.medicationKey
    && candidate.indication === request.indication
    && candidate.route === request.route
    && age.approximateDays >= candidate.minimumAgeDays
    && age.approximateDays < candidate.maximumAgeDaysExclusive
  )
  if (!profile) return { status: "NO_REVIEWED_PROFILE", manualDocumentationAllowed: true }
  let amount: number
  if (profile.basis === "FLAT") {
    if (profile.flatAmount == null) {
      return { status: "NO_REVIEWED_PROFILE", manualDocumentationAllowed: true }
    }
    amount = profile.flatAmount
  } else if (profile.basis === "TBW_KG") {
    if (request.totalBodyWeightKg == null || request.totalBodyWeightKg <= 0) {
      return { status: "MISSING_WEIGHT", manualDocumentationAllowed: true }
    }
    amount = request.totalBodyWeightKg * (profile.amountPerUnit ?? 0)
  } else {
    if (request.bodySurfaceAreaM2 == null || request.bodySurfaceAreaM2 <= 0) {
      return { status: "MISSING_BSA", manualDocumentationAllowed: true }
    }
    amount = request.bodySurfaceAreaM2 * (profile.amountPerUnit ?? 0)
  }

  return {
    status: "AVAILABLE",
    amount: clampDose(amount, profile),
    doseUnit: profile.doseUnit,
    profileKey: profile.key,
    profileVersion: profile.version,
    sourceIds: profile.sourceIds,
    basis: profile.basis,
  }
}

export type PediatricRuleManifest = {
  rulesetVersion: string
  productionReady: boolean
  approvedDoseProfileCount: number
  pendingDoseProfileCount: number
}

export function createPediatricRuleManifest(
  profiles: readonly PediatricDoseProfile[],
): PediatricRuleManifest {
  return {
    rulesetVersion: PEDIATRIC_RULESET_VERSION,
    productionReady: false,
    approvedDoseProfileCount: profiles.filter(profile => profile.reviewStatus === "APPROVED").length,
    pendingDoseProfileCount: profiles.filter(profile => profile.reviewStatus === "PENDING").length,
  }
}

export const PEDIATRIC_DOSE_PROFILES: readonly PediatricDoseProfile[] = []
