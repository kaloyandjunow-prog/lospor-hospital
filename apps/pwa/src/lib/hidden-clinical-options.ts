import {
  applicablePediatricDrugProfiles,
  applicablePediatricInfusionProfiles,
  isClinicalRuleHidden,
  visiblePediatricInfusionRoutes,
  type AdultDoseProfileRule,
  type ClinicalPresetScope,
  type ClinicalRuleOrigin,
  type PediatricDrugProfileRule,
  type PediatricInfusionProfileRule,
} from "@lospor/core/clinical-rules"
import type { PediatricAgeInput } from "@lospor/core/pediatric"
import {
  metadataString,
  metadataStrings,
} from "@lospor/core/option-contracts"
import type { LibraryOption } from "@lospor/core/option-library"

export type ActiveClinicalPreset = {
  id: string
  version?: number
  scope?: ClinicalPresetScope
} | null

export type SearchOnlyRuleProvenance = {
  key: string
  version: string
  sourceIds: string[]
  presetId?: string
  presetVersion?: number
  presetScope?: ClinicalPresetScope
}

export type SearchOnlyMedicationOption = {
  name: string
  unit: string
  color: string
  category: string
  routes: string[]
  rule: SearchOnlyRuleProvenance
}

type HiddenOptionsInput = {
  options: readonly LibraryOption[]
  adultDoseProfiles?: readonly AdultDoseProfileRule[]
  pediatricDrugProfiles?: readonly PediatricDrugProfileRule[]
  pediatricInfusionProfiles?: readonly PediatricInfusionProfileRule[]
  patientAge?: PediatricAgeInput | null
  patientWeightKg?: number | null
  activePreset?: ActiveClinicalPreset
  fallbackUnit: string
  fallbackColor: (option: LibraryOption) => string
}

function optionKeys(option: LibraryOption): string[] {
  return [...new Set([option.label, option.value]
    .map(value => value.trim().toUpperCase())
    .filter(Boolean))]
}

function scopeFromOrigin(origin: ClinicalRuleOrigin): ClinicalPresetScope | undefined {
  if (origin === "PLATFORM") return "PLATFORM"
  if (origin === "INSTITUTION" || origin === "INSTITUTION_OVERRIDE") return "INSTITUTION"
  if (origin === "USER") return "USER"
  return undefined
}

function provenance(input: {
  ruleKey: string
  ruleVersion: string
  sourceIds?: readonly string[]
  presetId?: string
  origin: ClinicalRuleOrigin
  activePreset?: ActiveClinicalPreset
}): SearchOnlyRuleProvenance {
  const activeMatches = !!input.presetId && input.activePreset?.id === input.presetId
  return {
    key: input.ruleKey,
    version: input.ruleVersion,
    sourceIds: [...(input.sourceIds ?? [])],
    ...(input.presetId ? { presetId: input.presetId } : {}),
    ...(activeMatches && input.activePreset?.version != null
      ? { presetVersion: input.activePreset.version }
      : {}),
    ...(scopeFromOrigin(input.origin) ?? (activeMatches ? input.activePreset?.scope : undefined)
      ? { presetScope: scopeFromOrigin(input.origin) ?? input.activePreset?.scope }
      : {}),
  }
}

function optionShape(
  option: LibraryOption,
  rule: SearchOnlyRuleProvenance,
  fallbackUnit: string,
  fallbackColor: (option: LibraryOption) => string,
): SearchOnlyMedicationOption {
  const routes = metadataStrings(option.metadata, "routes")
  return {
    name: option.label,
    unit: metadataString(option.metadata, "unit")
      ?? metadataString(option.metadata, "defaultUnit")
      ?? fallbackUnit,
    color: option.color ?? fallbackColor(option),
    category: option.group ?? "Other",
    routes: routes.length ? routes : ["IV"],
    rule,
  }
}

function oneApplicableDrugRule(
  option: LibraryOption,
  profiles: readonly PediatricDrugProfileRule[],
  age: PediatricAgeInput | null | undefined,
  weightKg: number | null | undefined,
): PediatricDrugProfileRule | undefined {
  const matches = new Map<string, PediatricDrugProfileRule>()
  for (const key of optionKeys(option)) {
    for (const profile of applicablePediatricDrugProfiles({
      medicationKey: key,
      age: age ?? null,
      weightKg,
      profiles,
    })) matches.set(profile.ruleKey, profile)
  }
  return matches.size === 1 ? matches.values().next().value : undefined
}

function oneApplicableInfusionRule(
  option: LibraryOption,
  profiles: readonly PediatricInfusionProfileRule[],
  age: PediatricAgeInput | null | undefined,
  weightKg: number | null | undefined,
): PediatricInfusionProfileRule | undefined {
  const matches = new Map<string, PediatricInfusionProfileRule>()
  for (const key of optionKeys(option)) {
    for (const profile of applicablePediatricInfusionProfiles({
      itemKey: key,
      age: age ?? null,
      weightKg,
      profiles,
    })) matches.set(profile.ruleKey, profile)
  }
  return matches.size === 1 ? matches.values().next().value : undefined
}

function adultRuleForOption(
  option: LibraryOption,
  rules: readonly AdultDoseProfileRule[],
  kind: AdultDoseProfileRule["kind"],
): AdultDoseProfileRule | undefined {
  const keys = new Set(optionKeys(option))
  const matches = rules.filter(rule => (
    rule.kind === kind
    && [rule.itemKey, rule.labelEn].some(value => keys.has(value.trim().toUpperCase()))
  ))
  return matches.length === 1 ? matches[0] : undefined
}

/**
 * Drugs hidden by the effective rules remain available only to typed search.
 * The returned rows intentionally contain identity, route and audit data only:
 * callers must not reattach dose, range, concentration or formulation fields.
 */
export function hiddenDrugSearchOptions(input: HiddenOptionsInput): SearchOnlyMedicationOption[] {
  return input.options.flatMap(option => {
    if (!isClinicalRuleHidden(option)) return []
    const pediatric = oneApplicableDrugRule(
      option,
      input.pediatricDrugProfiles ?? [],
      input.patientAge,
      input.patientWeightKg,
    )
    const adult = adultRuleForOption(option, input.adultDoseProfiles ?? [], "ADULT_DRUG_PROFILE")
    const hiddenRule = pediatric?.availability === "HIDDEN" ? pediatric : adult?.availability === "HIDDEN" ? adult : undefined
    if (!hiddenRule) return []
    return [optionShape(option, provenance({
      ruleKey: hiddenRule.ruleKey,
      ruleVersion: hiddenRule.ruleVersion,
      sourceIds: "sourceIds" in hiddenRule ? hiddenRule.sourceIds : [],
      presetId: hiddenRule.presetId,
      origin: hiddenRule.origin,
      activePreset: input.activePreset,
    }), input.fallbackUnit, input.fallbackColor)]
  })
}

/**
 * An infusion is search-only when its whole rule is hidden or no authored route
 * survives. This also covers older rule bundles that marked every route hidden
 * without setting the top-level hidden metadata flag.
 */
export function hiddenInfusionSearchOptions(input: HiddenOptionsInput): SearchOnlyMedicationOption[] {
  return input.options.flatMap(option => {
    const pediatric = oneApplicableInfusionRule(
      option,
      input.pediatricInfusionProfiles ?? [],
      input.patientAge,
      input.patientWeightKg,
    )
    const pediatricHidden = !!pediatric && (
      pediatric.disposition === "HIDDEN"
      || visiblePediatricInfusionRoutes(pediatric).length === 0
    )
    const adult = adultRuleForOption(option, input.adultDoseProfiles ?? [], "ADULT_INFUSION_PROFILE")
    const adultHidden = adult?.availability === "HIDDEN"
    if (!isClinicalRuleHidden(option) && !pediatricHidden && !adultHidden) return []
    const hiddenRule = pediatricHidden ? pediatric : adultHidden ? adult : undefined
    if (!hiddenRule) return []
    return [optionShape(option, provenance({
      ruleKey: hiddenRule.ruleKey,
      ruleVersion: hiddenRule.ruleVersion,
      sourceIds: "sourceIds" in hiddenRule ? hiddenRule.sourceIds : [],
      presetId: hiddenRule.presetId,
      origin: hiddenRule.origin,
      activePreset: input.activePreset,
    }), input.fallbackUnit, input.fallbackColor)]
  })
}
