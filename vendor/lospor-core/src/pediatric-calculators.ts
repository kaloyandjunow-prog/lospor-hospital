import {
  PEDIATRIC_RULESET_VERSION,
  type PediatricAgeInput,
  type PediatricRuleReviewStatus,
} from "./pediatric"

export type PediatricCalculationProvenance = {
  ruleVersion: string
  sourceIds: string[]
  reviewStatus: PediatricRuleReviewStatus
}

export type PediatricUnavailableCalculation = PediatricCalculationProvenance & {
  available: false
  reason: "REVIEWED_PROFILE_REQUIRED" | "INVALID_INPUT" | "AGE_NOT_SUPPORTED"
}

export type PediatricAvailableCalculation<T> = PediatricCalculationProvenance & {
  available: true
  value: T
}

export type PediatricCalculation<T> =
  | PediatricAvailableCalculation<T>
  | PediatricUnavailableCalculation

function unavailable(
  reason: PediatricUnavailableCalculation["reason"],
  sourceIds: string[] = [],
): PediatricUnavailableCalculation {
  return {
    available: false,
    reason,
    ruleVersion: PEDIATRIC_RULESET_VERSION,
    sourceIds,
    reviewStatus: "PENDING",
  }
}

export function calculateMostellerBsa(input: {
  heightCm: number
  weightKg: number
}): PediatricCalculation<{ squareMetres: number }> {
  if (
    !Number.isFinite(input.heightCm)
    || !Number.isFinite(input.weightKg)
    || input.heightCm <= 0
    || input.weightKg <= 0
  ) {
    return unavailable("INVALID_INPUT", ["MOSTELLER_BSA_1987"])
  }
  return {
    available: true,
    value: {
      squareMetres: Math.round(Math.sqrt(input.heightCm * input.weightKg / 3600) * 10_000) / 10_000,
    },
    ruleVersion: PEDIATRIC_RULESET_VERSION,
    sourceIds: ["MOSTELLER_BSA_1987"],
    reviewStatus: "APPROVED",
  }
}

const NEONATAL_MAINTENANCE_RANGES = [
  { minimumDay: 0, maximumDay: 1, minimumMlKgDay: 50, maximumMlKgDay: 60 },
  { minimumDay: 2, maximumDay: 2, minimumMlKgDay: 70, maximumMlKgDay: 80 },
  { minimumDay: 3, maximumDay: 3, minimumMlKgDay: 80, maximumMlKgDay: 100 },
  { minimumDay: 4, maximumDay: 4, minimumMlKgDay: 100, maximumMlKgDay: 120 },
  { minimumDay: 5, maximumDay: 28, minimumMlKgDay: 120, maximumMlKgDay: 150 },
] as const

export function calculatePediatricMaintenanceFluid(input: {
  weightKg: number
  age?: Pick<PediatricAgeInput, "value" | "unit"> | null
}): PediatricCalculation<{
  dailyMl: number | null
  hourlyMl: number | null
  dailyRangeMl: { minimum: number; maximum: number } | null
  method: "HOLLIDAY_SEGAR" | "TERM_NEONATE_DAY_OF_LIFE"
}> {
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    return unavailable("INVALID_INPUT", ["NICE_NG29"])
  }

  if (input.age?.unit === "DAYS" && input.age.value >= 0 && input.age.value <= 28) {
    const completedDay = Math.floor(input.age.value)
    const band = NEONATAL_MAINTENANCE_RANGES.find(
      item => completedDay >= item.minimumDay && completedDay <= item.maximumDay,
    )
    if (band) {
      return {
        available: true,
        value: {
          dailyMl: null,
          hourlyMl: null,
          dailyRangeMl: {
            minimum: Math.round(input.weightKg * band.minimumMlKgDay),
            maximum: Math.round(input.weightKg * band.maximumMlKgDay),
          },
          method: "TERM_NEONATE_DAY_OF_LIFE",
        },
        ruleVersion: PEDIATRIC_RULESET_VERSION,
        sourceIds: ["NICE_NG29"],
        reviewStatus: "APPROVED",
      }
    }
  }

  const dailyMl = input.weightKg <= 10
    ? input.weightKg * 100
    : input.weightKg <= 20
      ? 1000 + (input.weightKg - 10) * 50
      : 1500 + (input.weightKg - 20) * 20
  return {
    available: true,
    value: {
      dailyMl: Math.round(dailyMl),
      hourlyMl: Math.round(dailyMl / 24 * 10) / 10,
      dailyRangeMl: null,
      method: "HOLLIDAY_SEGAR",
    },
    ruleVersion: PEDIATRIC_RULESET_VERSION,
    sourceIds: ["NICE_NG29"],
    reviewStatus: "APPROVED",
  }
}

export function calculateRcukPediatricResuscitation(input: {
  weightKg: number
}): PediatricCalculation<{
  shockJoules: number
  adrenalineMicrograms: number
  adrenalineMilligrams: number
  amiodaroneFirstDoseMilligrams: number
  amiodaroneSecondDoseMilligrams: number
  repeatAdrenalineEveryMinutes: { minimum: 3; maximum: 5 }
}> {
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    return unavailable("INVALID_INPUT", ["RCUK_PALS_2025"])
  }
  const adrenalineMicrograms = Math.min(input.weightKg * 10, 1000)
  return {
    available: true,
    value: {
      shockJoules: input.weightKg * 4,
      adrenalineMicrograms,
      adrenalineMilligrams: adrenalineMicrograms / 1000,
      amiodaroneFirstDoseMilligrams: Math.min(input.weightKg * 5, 300),
      amiodaroneSecondDoseMilligrams: Math.min(input.weightKg * 5, 150),
      repeatAdrenalineEveryMinutes: { minimum: 3, maximum: 5 },
    },
    ruleVersion: PEDIATRIC_RULESET_VERSION,
    sourceIds: ["RCUK_PALS_2025"],
    reviewStatus: "APPROVED",
  }
}

export type ReviewedVentilationProfile = {
  id: string
  version: string
  tidalVolumeMlPerKg: { minimum: number; maximum: number }
  weightBasis: "TBW" | "IBW"
  sourceIds: string[]
  reviewStatus: PediatricRuleReviewStatus
}

export function calculatePediatricVentilationReference(input: {
  weightKg: number
  profile?: ReviewedVentilationProfile | null
}): PediatricCalculation<{
  tidalVolumeMl: { minimum: number; maximum: number }
  weightBasis: "TBW" | "IBW"
  profileId: string
}> {
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    return unavailable("INVALID_INPUT")
  }
  if (!input.profile || input.profile.reviewStatus !== "APPROVED") {
    return unavailable("REVIEWED_PROFILE_REQUIRED", input.profile?.sourceIds)
  }
  return {
    available: true,
    value: {
      tidalVolumeMl: {
        minimum: input.weightKg * input.profile.tidalVolumeMlPerKg.minimum,
        maximum: input.weightKg * input.profile.tidalVolumeMlPerKg.maximum,
      },
      weightBasis: input.profile.weightBasis,
      profileId: input.profile.id,
    },
    ruleVersion: input.profile.version,
    sourceIds: input.profile.sourceIds,
    reviewStatus: input.profile.reviewStatus,
  }
}

export type ReviewedBloodVolumeProfile = {
  id: string
  version: string
  ebvMlPerKg: number
  sourceIds: string[]
  reviewStatus: PediatricRuleReviewStatus
}

export function calculatePediatricBloodVolume(input: {
  weightKg: number
  currentHaematocrit?: number | null
  minimumAcceptableHaematocrit?: number | null
  profile?: ReviewedBloodVolumeProfile | null
}): PediatricCalculation<{
  estimatedBloodVolumeMl: number
  allowableBloodLossMl: number | null
  profileId: string
}> {
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    return unavailable("INVALID_INPUT")
  }
  if (!input.profile || input.profile.reviewStatus !== "APPROVED") {
    return unavailable("REVIEWED_PROFILE_REQUIRED", input.profile?.sourceIds)
  }
  const estimatedBloodVolumeMl = input.weightKg * input.profile.ebvMlPerKg
  const current = input.currentHaematocrit
  const minimum = input.minimumAcceptableHaematocrit
  const allowableBloodLossMl = current != null
    && minimum != null
    && Number.isFinite(current)
    && Number.isFinite(minimum)
    && current > 0
    && minimum >= 0
    && minimum <= current
    ? estimatedBloodVolumeMl * (current - minimum) / current
    : null
  return {
    available: true,
    value: {
      estimatedBloodVolumeMl,
      allowableBloodLossMl,
      profileId: input.profile.id,
    },
    ruleVersion: input.profile.version,
    sourceIds: input.profile.sourceIds,
    reviewStatus: input.profile.reviewStatus,
  }
}

export type ReviewedLocalAnaestheticProfile = {
  id: string
  medicationKey: string
  version: string
  maxMgPerKg: number
  absoluteMaxMg?: number | null
  sourceIds: string[]
  reviewStatus: PediatricRuleReviewStatus
}

export function calculatePediatricLocalAnaestheticLimit(input: {
  weightKg: number
  concentrationMgPerMl?: number | null
  profile?: ReviewedLocalAnaestheticProfile | null
}): PediatricCalculation<{
  maximumMg: number
  maximumMl: number | null
  profileId: string
}> {
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    return unavailable("INVALID_INPUT")
  }
  if (!input.profile || input.profile.reviewStatus !== "APPROVED") {
    return unavailable("REVIEWED_PROFILE_REQUIRED", input.profile?.sourceIds)
  }
  const weightMaximum = input.weightKg * input.profile.maxMgPerKg
  const maximumMg = input.profile.absoluteMaxMg == null
    ? weightMaximum
    : Math.min(weightMaximum, input.profile.absoluteMaxMg)
  const maximumMl = input.concentrationMgPerMl != null
    && Number.isFinite(input.concentrationMgPerMl)
    && input.concentrationMgPerMl > 0
    ? maximumMg / input.concentrationMgPerMl
    : null
  return {
    available: true,
    value: {
      maximumMg,
      maximumMl,
      profileId: input.profile.id,
    },
    ruleVersion: input.profile.version,
    sourceIds: input.profile.sourceIds,
    reviewStatus: input.profile.reviewStatus,
  }
}
