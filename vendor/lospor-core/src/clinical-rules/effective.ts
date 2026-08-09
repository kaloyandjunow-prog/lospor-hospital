import {
  type PediatricAgeInput,
  normalizePediatricAge,
} from "../pediatric"
import {
  calculateMostellerBsa,
} from "../pediatric-calculators"
import {
  type PediatricDoseProfile,
  type PediatricDoseResolution,
  resolvePediatricDoseSuggestion,
} from "../pediatric-dose"
import {
  type AdultDoseProfileRule,
} from "./adult-profiles"
import {
  effectiveRuleSourceIds,
} from "./internal"
import {
  type PediatricDrugProfileRule,
  type PediatricFluidProfileRule,
  type PediatricInfusionProfileRule,
} from "./pediatric-profiles"
import {
  type ClinicalPresetRule,
  type ClinicalPresetScope,
  type ClinicalRuleMode,
  type ClinicalRuleOrigin,
  type EffectiveClinicalRule,
  type InstitutionClinicalRuleOverrideDto,
} from "./types"

export function resolveEffectiveClinicalRules(
  presetId: string,
  presetRules: readonly ClinicalPresetRule[],
  overrides: readonly InstitutionClinicalRuleOverrideDto[],
): EffectiveClinicalRule[] {
  const effective = new Map<string, EffectiveClinicalRule>()
  for (const rule of presetRules) {
    effective.set(rule.ruleKey, {
      ...rule,
      sourceRefs: [...rule.sourceRefs],
      origin: "PRESET",
      presetId,
      overrideId: null,
    })
  }
  const approved = overrides
    .filter(item => item.presetId === presetId && item.status === "APPROVED")
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
  for (const item of approved) {
    effective.set(item.ruleKey, {
      id: item.id,
      ruleKey: item.ruleKey,
      ruleVersion: item.overrideVersion,
      payload: item.payload,
      sourceRefs: [...item.sourceRefs],
      origin: "INSTITUTION_OVERRIDE",
      presetId,
      overrideId: item.id,
    })
  }
  return [...effective.values()].sort((left, right) => left.ruleKey.localeCompare(right.ruleKey))
}

export function clinicalPresetRulesToEffective(
  presetId: string,
  scope: ClinicalPresetScope,
  rules: readonly ClinicalPresetRule[],
): EffectiveClinicalRule[] {
  const origin: ClinicalRuleOrigin = scope === "PLATFORM"
    ? "PLATFORM"
    : scope === "INSTITUTION"
      ? "INSTITUTION"
      : "USER"
  return rules
    .map(rule => ({
      ...rule,
      sourceRefs: [...rule.sourceRefs],
      origin,
      presetId,
      overrideId: null,
    }))
    .sort((left, right) => left.ruleKey.localeCompare(right.ruleKey))
}

export function pediatricDoseProfilesFromRules(
  rules: readonly EffectiveClinicalRule[],
): PediatricDoseProfile[] {
  return rules.flatMap(rule => {
    if (rule.payload.kind !== "PEDIATRIC_DRUG_DOSE") return []
    const payload = rule.payload
    return [{
      key: rule.ruleKey,
      medicationKey: payload.medicationKey,
      inn: payload.inn ?? undefined,
      indication: payload.indication,
      route: payload.route,
      minimumAgeDays: payload.minimumAgeDays,
      maximumAgeDaysExclusive: payload.maximumAgeDaysExclusive,
      basis: payload.basis,
      amountPerUnit: payload.amountPerUnit ?? undefined,
      flatAmount: payload.flatAmount ?? undefined,
      minimumAmount: payload.minimumAmount,
      maximumAmount: payload.maximumAmount,
      roundTo: payload.roundTo,
      doseUnit: payload.doseUnit,
      sourceIds: effectiveRuleSourceIds(rule),
      version: rule.ruleVersion,
      reviewStatus: "APPROVED" as const,
    }]
  })
}

export function applicablePediatricDoseProfiles(input: {
  medicationKey: string
  age: PediatricAgeInput | null
  profiles: readonly PediatricDoseProfile[]
}): PediatricDoseProfile[] {
  if (!input.age) return []
  const age = normalizePediatricAge(input.age)
  if (!age) return []
  return input.profiles
    .filter(profile =>
      profile.reviewStatus === "APPROVED"
      && profile.medicationKey === input.medicationKey
      && age.approximateDays >= profile.minimumAgeDays
      && age.approximateDays < profile.maximumAgeDaysExclusive
    )
    .sort((left, right) =>
      left.indication.localeCompare(right.indication)
      || left.route.localeCompare(right.route),
    )
}

export function resolvePediatricProfileDose(input: {
  profile: PediatricDoseProfile
  age: PediatricAgeInput
  weightKg?: number | null
  heightCm?: number | null
}): PediatricDoseResolution {
  const bsa = input.heightCm != null && input.weightKg != null
    ? calculateMostellerBsa({ heightCm: input.heightCm, weightKg: input.weightKg })
    : null
  return resolvePediatricDoseSuggestion({
    medicationKey: input.profile.medicationKey,
    indication: input.profile.indication,
    route: input.profile.route,
    age: input.age,
    totalBodyWeightKg: input.weightKg,
    bodySurfaceAreaM2: bsa?.available ? bsa.value.squareMetres : null,
  }, [input.profile])
}
export type ClinicalRulesRuntimeBundle = {
  mode?: ClinicalRuleMode
  preset: {
    id: string
    name: string
    version?: number
    scope?: ClinicalPresetScope
  } | null
  productionReady: boolean
  effectiveRules: EffectiveClinicalRule[]
  doseProfiles: PediatricDoseProfile[]
  pediatricDrugProfiles?: PediatricDrugProfileRule[]
  pediatricInfusionProfiles?: PediatricInfusionProfileRule[]
  pediatricFluidProfiles?: PediatricFluidProfileRule[]
  adultDoseProfiles?: AdultDoseProfileRule[]
}

export type ClinicalRulesRuntimeSnapshot = ClinicalRulesRuntimeBundle & {
  source: "server" | "cache"
  cachedAt: string
}

export type ClinicalRulesSnapshotStorage = {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
  delete: (key: string) => Promise<void>
}

type StoredClinicalRulesSnapshot = {
  cachedAt: string
  response: ClinicalRulesRuntimeBundle
}

function validRuntimeBundle(value: unknown): value is ClinicalRulesRuntimeBundle {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<ClinicalRulesRuntimeBundle>
  return (item.preset === null || (
    !!item.preset
    && typeof item.preset.id === "string"
    && typeof item.preset.name === "string"
  ))
    && typeof item.productionReady === "boolean"
    && Array.isArray(item.effectiveRules)
    && Array.isArray(item.doseProfiles)
    && (item.pediatricInfusionProfiles === undefined || Array.isArray(item.pediatricInfusionProfiles))
    && (item.pediatricFluidProfiles === undefined || Array.isArray(item.pediatricFluidProfiles))
}

function parseStoredRuntimeBundle(raw: string | null): StoredClinicalRulesSnapshot | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<StoredClinicalRulesSnapshot>
    return typeof value.cachedAt === "string" && validRuntimeBundle(value.response)
      ? value as StoredClinicalRulesSnapshot
      : null
  } catch {
    return null
  }
}

export function createClinicalRulesSnapshotRepository(input: {
  cacheKey: string
  fetchRules: () => Promise<ClinicalRulesRuntimeBundle>
  storage: ClinicalRulesSnapshotStorage
  now?: () => Date
}) {
  let inFlight: Promise<ClinicalRulesRuntimeSnapshot> | null = null

  async function loadFresh(): Promise<ClinicalRulesRuntimeSnapshot> {
    try {
      const response = await input.fetchRules()
      if (!validRuntimeBundle(response)) {
        throw new Error("Invalid clinical-rules response")
      }
      const cachedAt = (input.now?.() ?? new Date()).toISOString()
      await input.storage.set(
        input.cacheKey,
        JSON.stringify({ cachedAt, response } satisfies StoredClinicalRulesSnapshot),
      )
      return { ...response, source: "server", cachedAt }
    } catch (error) {
      const stored = parseStoredRuntimeBundle(await input.storage.get(input.cacheKey))
      if (stored) {
        return { ...stored.response, source: "cache", cachedAt: stored.cachedAt }
      }
      throw error
    }
  }

  return {
    load(options: { force?: boolean } = {}) {
      if (options.force || !inFlight) {
        inFlight = loadFresh().finally(() => {
          inFlight = null
        })
      }
      return inFlight
    },
    clear() {
      return input.storage.delete(input.cacheKey)
    },
  }
}
