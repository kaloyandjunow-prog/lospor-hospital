import {
  type DoseProfile,
} from "../catalog"
import {
  type CanonicalDoseUnit,
  canonicalizeDoseProfile,
} from "../clinical-rule-vocabulary"
import {
  effectiveRuleSourceIds,
} from "./internal"
import {
  type ClinicalRuleOrigin,
  type DrugProfileAvailability,
  type EffectiveClinicalRule,
  type PediatricInfusionDisposition,
} from "./types"

export type PediatricDrugProfileRule = {
  ruleKey: string
  ruleVersion: string
  medicationKey: string
  labelEn: string
  labelBg: string | null
  inn: string | null
  category: string | null
  minimumAgeDays: number
  maximumAgeDaysExclusive: number
  minimumWeightKg?: number | null
  minimumWeightInclusive?: boolean
  maximumWeightKg?: number | null
  maximumWeightInclusive?: boolean
  availability?: DrugProfileAvailability
  profile: DoseProfile | null
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
  manualUnit?: string | null
  sourceIds: string[]
  origin: ClinicalRuleOrigin
  presetId: string
}

export function pediatricDrugProfilesFromRules(
  rules: readonly EffectiveClinicalRule[],
): PediatricDrugProfileRule[] {
  return rules.flatMap(rule => {
    const payload = rule.payload
    if (payload.kind !== "PEDIATRIC_DRUG_PROFILE") return []
    return [{
      ruleKey: rule.ruleKey,
      ruleVersion: rule.ruleVersion,
      medicationKey: payload.medicationKey,
      labelEn: payload.labelEn,
      labelBg: payload.labelBg ?? null,
      inn: payload.inn ?? null,
      category: payload.category ?? null,
      minimumAgeDays: payload.minimumAgeDays,
      maximumAgeDaysExclusive: payload.maximumAgeDaysExclusive,
      minimumWeightKg: payload.minimumWeightKg ?? null,
      minimumWeightInclusive: payload.minimumWeightInclusive ?? true,
      maximumWeightKg: payload.maximumWeightKg ?? null,
      maximumWeightInclusive: payload.maximumWeightInclusive ?? false,
      availability: payload.availability ?? "AUTO",
      profile: payload.profile ? canonicalizeDoseProfile(payload.profile) : null,
      unit: payload.unit,
      routeUnits: { ...payload.routeUnits },
      manualUnit: payload.manualUnit ?? null,
      sourceIds: effectiveRuleSourceIds(rule),
      origin: rule.origin,
      presetId: rule.presetId,
    }]
  })
}

export type PediatricFluidProfileRule = {
  ruleKey: string
  ruleVersion: string
  itemKey: string
  labelEn: string
  labelBg: string | null
  category: string | null
  minimumAgeDays: number
  maximumAgeDaysExclusive: number
  profile: DoseProfile
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
  sourceIds: string[]
  origin: ClinicalRuleOrigin
  presetId: string
}

export function pediatricFluidProfilesFromRules(
  rules: readonly EffectiveClinicalRule[],
): PediatricFluidProfileRule[] {
  return rules.flatMap(rule => {
    const payload = rule.payload
    if (payload.kind !== "PEDIATRIC_FLUID_PROFILE") return []
    return [{
      ruleKey: rule.ruleKey,
      ruleVersion: rule.ruleVersion,
      itemKey: payload.itemKey,
      labelEn: payload.labelEn,
      labelBg: payload.labelBg ?? null,
      category: payload.category ?? null,
      minimumAgeDays: payload.minimumAgeDays,
      maximumAgeDaysExclusive: payload.maximumAgeDaysExclusive,
      profile: canonicalizeDoseProfile(payload.profile),
      unit: payload.unit,
      routeUnits: { ...payload.routeUnits },
      sourceIds: effectiveRuleSourceIds(rule),
      origin: rule.origin,
      presetId: rule.presetId,
    }]
  })
}

export type PediatricInfusionProfileRule = {
  ruleKey: string
  ruleVersion: string
  itemKey: string
  labelEn: string
  labelBg: string | null
  category: string | null
  disposition: PediatricInfusionDisposition
  routeDispositions: Record<string, PediatricInfusionDisposition>
  manualEntryOnly: boolean
  routeManualEntryOnly: Record<string, boolean>
  minimumAgeDays: number
  maximumAgeDaysExclusive: number
  minimumWeightKg: number | null
  minimumWeightInclusive: boolean
  maximumWeightKg: number | null
  maximumWeightInclusive: boolean
  routineSuggestion: boolean
  advisory: string | null
  profile: DoseProfile | null
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
  manualUnit: string | null
  sourceIds: string[]
  origin: ClinicalRuleOrigin
  presetId: string
}

export function pediatricInfusionProfilesFromRules(
  rules: readonly EffectiveClinicalRule[],
): PediatricInfusionProfileRule[] {
  return rules.flatMap(rule => {
    const payload = rule.payload
    if (payload.kind !== "PEDIATRIC_INFUSION_PROFILE") return []
    return [{
      ruleKey: rule.ruleKey,
      ruleVersion: rule.ruleVersion,
      itemKey: payload.itemKey,
      labelEn: payload.labelEn,
      labelBg: payload.labelBg ?? null,
      category: payload.category ?? null,
      disposition: payload.disposition,
      routeDispositions: { ...payload.routeDispositions },
      manualEntryOnly: payload.manualEntryOnly,
      routeManualEntryOnly: { ...payload.routeManualEntryOnly },
      minimumAgeDays: payload.minimumAgeDays,
      maximumAgeDaysExclusive: payload.maximumAgeDaysExclusive,
      minimumWeightKg: payload.minimumWeightKg ?? null,
      minimumWeightInclusive: payload.minimumWeightInclusive ?? true,
      maximumWeightKg: payload.maximumWeightKg ?? null,
      maximumWeightInclusive: payload.maximumWeightInclusive ?? false,
      routineSuggestion: payload.routineSuggestion ?? true,
      advisory: payload.advisory ?? null,
      profile: payload.profile ? canonicalizeDoseProfile(payload.profile) : null,
      unit: payload.unit,
      routeUnits: { ...payload.routeUnits },
      manualUnit: payload.manualUnit ?? null,
      sourceIds: effectiveRuleSourceIds(rule),
      origin: rule.origin,
      presetId: rule.presetId,
    }]
  })
}
