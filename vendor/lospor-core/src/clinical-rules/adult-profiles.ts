import {
  DRUG_CATALOG,
  type DoseProfile,
  FLUID_CATALOG,
  INFUSION_CATALOG,
  parseDoseProfile,
} from "../catalog"
import {
  type CanonicalDoseUnit,
  canonicalDoseProfileMetadata,
  canonicalizeDoseProfile,
} from "../clinical-rule-vocabulary"
import {
  type AdultDoseProfileRuleKind,
  type AdultDoseProfileRulePayload,
  type ClinicalRuleOrigin,
  type ClinicalRulePayload,
  type DrugProfileAvailability,
  type EffectiveClinicalRule,
} from "./types"

export const LOSPOR_ADULT_RULESET_KEY = "LOSPOR_ADULTS" as const
export const LOSPOR_ADULT_RULESET_NAME = "LOSPORADULTS Rules" as const

function adultDosePayload(input: {
  kind: AdultDoseProfileRuleKind
  itemKey: string
  label: string
  category?: string | null
  profileKind: "bolus" | "infusion" | "fluid"
  profile: unknown
}): AdultDoseProfileRulePayload {
  const parsed = parseDoseProfile(input.label, input.profileKind, input.profile)
  const metadata = canonicalDoseProfileMetadata(parsed)
  return {
    kind: input.kind,
    itemKey: input.itemKey,
    labelEn: input.label,
    labelBg: input.label,
    category: input.category ?? null,
    profile: metadata.profile,
    unit: metadata.unit,
    routeUnits: metadata.routeUnits,
  }
}

export function createLosporAdultRulePayloads(): ClinicalRulePayload[] {
  const drugs = DRUG_CATALOG.map(entry => adultDosePayload({
    kind: "ADULT_DRUG_PROFILE",
    itemKey: entry.name,
    label: entry.name,
    category: entry.category,
    profileKind: "bolus",
    profile: entry.profile,
  }))
  const infusions = INFUSION_CATALOG.map(entry => adultDosePayload({
    kind: "ADULT_INFUSION_PROFILE",
    itemKey: entry.name,
    label: entry.name,
    profileKind: "infusion",
    profile: entry.profile,
  }))
  const fluids = FLUID_CATALOG.map(entry => adultDosePayload({
    kind: "ADULT_FLUID_PROFILE",
    itemKey: entry.name,
    label: entry.name,
    category: entry.category,
    profileKind: "fluid",
    profile: entry.profile,
  }))
  return [...drugs, ...infusions, ...fluids]
}

export type AdultDoseProfileRule = {
  ruleKey: string
  ruleVersion: string
  itemKey: string
  labelEn: string
  labelBg: string | null
  category: string | null
  kind: AdultDoseProfileRuleKind
  profile: DoseProfile
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
  availability: DrugProfileAvailability
  origin: ClinicalRuleOrigin
  presetId: string
}

export function adultDoseProfilesFromRules(
  rules: readonly EffectiveClinicalRule[],
): AdultDoseProfileRule[] {
  return rules.flatMap(rule => {
    const payload = rule.payload
    if (
      payload.kind !== "ADULT_DRUG_PROFILE"
      && payload.kind !== "ADULT_INFUSION_PROFILE"
      && payload.kind !== "ADULT_FLUID_PROFILE"
    ) return []
    return [{
      ruleKey: rule.ruleKey,
      ruleVersion: rule.ruleVersion,
      itemKey: payload.itemKey,
      labelEn: payload.labelEn,
      labelBg: payload.labelBg ?? null,
      category: payload.category ?? null,
      kind: payload.kind,
      profile: canonicalizeDoseProfile(payload.profile),
      unit: payload.unit,
      routeUnits: { ...payload.routeUnits },
      availability: payload.kind === "ADULT_DRUG_PROFILE"
        ? payload.availability ?? "AUTO"
        : "AUTO",
      origin: rule.origin,
      presetId: rule.presetId,
    }]
  })
}
