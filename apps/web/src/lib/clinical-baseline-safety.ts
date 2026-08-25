import {
  adultDoseProfilesFromRules,
  pediatricDoseProfilesFromRules,
  pediatricDrugProfilesFromRules,
  pediatricFluidProfilesFromRules,
  pediatricInfusionProfilesFromRules,
  validateClinicalRulePayload,
  type ClinicalPresetScope,
  type ClinicalRuleMode,
  type ClinicalRuleOrigin,
  type ClinicalRulesRuntimeBundle,
  type EffectiveClinicalRule,
} from "@lospor/core/clinical-rules"

export type ClinicalBaselineFailure =
  | "NONE"
  | "MISSING"
  | "MALFORMED"
  | "UNPUBLISHED"
  | "WRONG_MODE"
  | "WRONG_VERSION"
  | "NOT_PRODUCTION_READY"

export type ClinicalBaselineEvaluation = {
  bundle: ClinicalRulesRuntimeBundle
  prospectiveGuidanceEnabled: boolean
  failure: ClinicalBaselineFailure
}

const SCOPES: readonly ClinicalPresetScope[] = ["PLATFORM", "INSTITUTION", "USER"]
const ORIGINS: readonly ClinicalRuleOrigin[] = [
  "PLATFORM",
  "INSTITUTION",
  "USER",
  "PRESET",
  "INSTITUTION_OVERRIDE",
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && !!value.trim()
}

function scope(value: unknown): ClinicalPresetScope | undefined {
  return SCOPES.includes(value as ClinicalPresetScope)
    ? value as ClinicalPresetScope
    : undefined
}

function origin(value: unknown): ClinicalRuleOrigin | null {
  return ORIGINS.includes(value as ClinicalRuleOrigin)
    ? value as ClinicalRuleOrigin
    : null
}

function payloadMatchesMode(kind: string, mode: ClinicalRuleMode): boolean {
  return mode === "ADULT"
    ? kind.startsWith("ADULT_")
    : kind.startsWith("PEDIATRIC_")
}

function parseRule(
  value: unknown,
  mode: ClinicalRuleMode,
  presetId: string | null,
): EffectiveClinicalRule | null {
  if (!isRecord(value)) return null
  const parsedPayload = validateClinicalRulePayload(value.payload)
  const parsedOrigin = origin(value.origin)
  const sourceRefs = value.sourceRefs
  if (
    !parsedPayload.valid
    || !payloadMatchesMode(parsedPayload.value.kind, mode)
    || !nonEmptyText(value.id)
    || !nonEmptyText(value.ruleKey)
    || !nonEmptyText(value.ruleVersion)
    || !parsedOrigin
    || !nonEmptyText(value.presetId)
    || value.presetId !== presetId
    || !Array.isArray(sourceRefs)
    || !sourceRefs.every(item => typeof item === "string")
    || (value.overrideId !== undefined && value.overrideId !== null && typeof value.overrideId !== "string")
  ) return null

  return {
    id: value.id,
    ruleKey: value.ruleKey,
    ruleVersion: value.ruleVersion,
    payload: parsedPayload.value,
    sourceRefs: [...sourceRefs],
    origin: parsedOrigin,
    presetId: value.presetId,
    overrideId: value.overrideId as string | null | undefined,
  }
}

function emptyBundle(mode: ClinicalRuleMode): ClinicalRulesRuntimeBundle {
  return {
    mode,
    preset: null,
    productionReady: false,
    effectiveRules: [],
    doseProfiles: [],
    pediatricDrugProfiles: [],
    pediatricInfusionProfiles: [],
    pediatricFluidProfiles: [],
    adultDoseProfiles: [],
  }
}

/**
 * Converts the runtime endpoint's untrusted JSON into the only clinical bundle
 * the client is allowed to use. Prospective values are enabled only when the
 * selected published baseline is complete and internally consistent. Profile
 * arrays from the wire are deliberately ignored and re-derived from validated
 * effective rules, preventing stale or wrong-version profile fallbacks.
 *
 * Valid hidden rules are retained even when another part of the envelope is
 * not production-ready. Consumers can therefore keep routine-hidden items out
 * of pickers while the separate boolean suppresses all prospective values.
 */
export function evaluateClinicalBaseline(
  value: unknown,
  expectedMode: ClinicalRuleMode,
): ClinicalBaselineEvaluation {
  if (!isRecord(value)) {
    return {
      bundle: emptyBundle(expectedMode),
      prospectiveGuidanceEnabled: false,
      failure: "MISSING",
    }
  }

  const rawPreset = isRecord(value.preset) ? value.preset : null
  const presetId = rawPreset && nonEmptyText(rawPreset.id) ? rawPreset.id : null
  const presetName = rawPreset && nonEmptyText(rawPreset.name) ? rawPreset.name : null
  const presetScope = rawPreset ? scope(rawPreset.scope) : undefined
  const presetVersion = rawPreset && Number.isSafeInteger(rawPreset.version) && Number(rawPreset.version) > 0
    ? Number(rawPreset.version)
    : undefined
  const preset = presetId && presetName
    ? {
        id: presetId,
        name: presetName,
        ...(presetVersion !== undefined ? { version: presetVersion } : {}),
        ...(presetScope ? { scope: presetScope } : {}),
      }
    : null

  const rawRules = Array.isArray(value.effectiveRules) ? value.effectiveRules : []
  const parsedRules = rawRules.flatMap(item => {
    const parsed = parseRule(item, expectedMode, presetId)
    return parsed ? [parsed] : []
  })
  const uniqueRuleKeys = new Set(parsedRules.map(rule => rule.ruleKey))
  const rulesValid = Array.isArray(value.effectiveRules)
    && rawRules.length > 0
    && parsedRules.length === rawRules.length
    && uniqueRuleKeys.size === parsedRules.length

  const adultDoseProfiles = adultDoseProfilesFromRules(parsedRules)
  const pediatricDrugProfiles = pediatricDrugProfilesFromRules(parsedRules)
  const pediatricInfusionProfiles = pediatricInfusionProfilesFromRules(parsedRules)
  const pediatricFluidProfiles = pediatricFluidProfilesFromRules(parsedRules)
  const doseProfiles = pediatricDoseProfilesFromRules(parsedRules)
  const hasModeProfiles = expectedMode === "ADULT"
    ? adultDoseProfiles.length > 0
    : pediatricDrugProfiles.length > 0
      || pediatricInfusionProfiles.length > 0
      || pediatricFluidProfiles.length > 0
      || doseProfiles.length > 0

  const modeValid = value.mode === expectedMode
  const statusValid = rawPreset?.status === undefined || rawPreset.status === "PUBLISHED"
  const versionValid = presetVersion !== undefined && !!presetScope
  const prospectiveGuidanceEnabled = !!preset
    && modeValid
    && statusValid
    && versionValid
    && value.productionReady === true
    && rulesValid
    && hasModeProfiles

  let failure: ClinicalBaselineFailure = "NONE"
  if (!preset) failure = "MISSING"
  else if (!modeValid) failure = "WRONG_MODE"
  else if (!statusValid) failure = "UNPUBLISHED"
  else if (!versionValid) failure = "WRONG_VERSION"
  else if (value.productionReady !== true) failure = "NOT_PRODUCTION_READY"
  else if (!rulesValid || !hasModeProfiles) failure = "MALFORMED"

  return {
    bundle: {
      mode: expectedMode,
      preset,
      productionReady: prospectiveGuidanceEnabled,
      effectiveRules: parsedRules,
      doseProfiles,
      pediatricDrugProfiles,
      pediatricInfusionProfiles,
      pediatricFluidProfiles,
      adultDoseProfiles,
    },
    prospectiveGuidanceEnabled,
    failure,
  }
}
