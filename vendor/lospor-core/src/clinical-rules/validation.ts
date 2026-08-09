import {
  type DoseProfile,
  parseDoseProfile,
} from "../catalog"
import {
  canonicalDoseProfileMetadata,
  canonicalDoseUnit,
  canonicalizeDoseProfile,
  normalizeAdministrationRoute,
} from "../clinical-rule-vocabulary"
import {
  isBloodProductFluid,
} from "../intraop-fluids"
import {
  type PediatricDoseBasis,
} from "../pediatric-dose"
import {
  type PediatricRuleAgeBand,
  type PediatricRuleWeightBand,
} from "./internal"
import {
  type AdultDoseProfileRulePayload,
  CLINICAL_RULE_KINDS,
  type ClinicalPresetRule,
  type ClinicalRuleKind,
  type ClinicalRulePayload,
  DRUG_PROFILE_AVAILABILITIES,
  type DrugProfileAvailability,
  FIXED_EQUIPMENT_RULE_REJECTION_MESSAGE,
  PEDIATRIC_DRUG_POLICY_DISPOSITIONS,
  PEDIATRIC_DRUG_POLICY_REVIEW_STATUSES,
  PEDIATRIC_INFUSION_DISPOSITIONS,
  type PediatricDrugDoseRulePayload,
  type PediatricDrugPolicyDisposition,
  type PediatricDrugPolicyReviewStatus,
  type PediatricDrugPolicyRulePayload,
  type PediatricDrugProfileRulePayload,
  type PediatricFluidProfileRulePayload,
  type PediatricInfusionDisposition,
  type PediatricInfusionProfileRulePayload,
  isLegacyEquipmentRuleKind,
  isRetiredAuthoringRuleKind,
  RETIRED_DOSE_RULE_REJECTION_MESSAGE,
} from "./types"

export type ClinicalRuleValidationIssue = { field: string; message: string }
export type ClinicalRuleValidation =
  | { valid: true; value: ClinicalRulePayload }
  | { valid: false; issues: ClinicalRuleValidationIssue[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function text(
  source: Record<string, unknown>,
  key: string,
  issues: ClinicalRuleValidationIssue[],
  options: { optional?: boolean; maximum?: number } = {},
): string | null {
  const raw = source[key]
  if (raw == null && options.optional) return null
  if (typeof raw !== "string" || !raw.trim()) {
    issues.push({ field: key, message: "Required text value" })
    return null
  }
  const value = raw.trim()
  if (value.length > (options.maximum ?? 200)) {
    issues.push({ field: key, message: `Must be at most ${options.maximum ?? 200} characters` })
  }
  return value
}

function numberValue(
  source: Record<string, unknown>,
  key: string,
  issues: ClinicalRuleValidationIssue[],
  options: { optional?: boolean; minimum?: number; exclusiveMinimum?: number } = {},
): number | null {
  const raw = source[key]
  if (raw == null && options.optional) return null
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    issues.push({ field: key, message: "Required finite number" })
    return null
  }
  if (options.minimum != null && raw < options.minimum) {
    issues.push({ field: key, message: `Must be at least ${options.minimum}` })
  }
  if (options.exclusiveMinimum != null && raw <= options.exclusiveMinimum) {
    issues.push({ field: key, message: `Must be greater than ${options.exclusiveMinimum}` })
  }
  return raw
}

function booleanValue(
  source: Record<string, unknown>,
  key: string,
  issues: ClinicalRuleValidationIssue[],
  fallback: boolean,
): boolean {
  const raw = source[key]
  if (raw == null) return fallback
  if (typeof raw !== "boolean") {
    issues.push({ field: key, message: "Must be a boolean" })
    return fallback
  }
  return raw
}

function validateAgeBand(
  source: Record<string, unknown>,
  issues: ClinicalRuleValidationIssue[],
): PediatricRuleAgeBand {
  const minimumAgeDays = numberValue(source, "minimumAgeDays", issues, { minimum: 0 }) ?? 0
  const maximumAgeDaysExclusive = numberValue(
    source,
    "maximumAgeDaysExclusive",
    issues,
    { exclusiveMinimum: 0 },
  ) ?? 0
  if (maximumAgeDaysExclusive <= minimumAgeDays) {
    issues.push({
      field: "maximumAgeDaysExclusive",
      message: "Must be greater than minimumAgeDays",
    })
  }
  return { minimumAgeDays, maximumAgeDaysExclusive }
}

function validateWeightBand(
  source: Record<string, unknown>,
  issues: ClinicalRuleValidationIssue[],
): Required<PediatricRuleWeightBand> {
  const minimumWeightKg = numberValue(source, "minimumWeightKg", issues, {
    optional: true,
    minimum: 0,
  })
  const maximumWeightKg = numberValue(source, "maximumWeightKg", issues, {
    optional: true,
    exclusiveMinimum: 0,
  })
  const minimumWeightInclusive = booleanValue(
    source,
    "minimumWeightInclusive",
    issues,
    true,
  )
  const maximumWeightInclusive = booleanValue(
    source,
    "maximumWeightInclusive",
    issues,
    false,
  )
  if (
    minimumWeightKg != null
    && maximumWeightKg != null
    && (
      maximumWeightKg < minimumWeightKg
      || (maximumWeightKg === minimumWeightKg
        && !(minimumWeightInclusive && maximumWeightInclusive))
    )
  ) {
    issues.push({
      field: "maximumWeightKg",
      message: "Weight band must contain at least one possible weight",
    })
  }
  return {
    minimumWeightKg,
    minimumWeightInclusive,
    maximumWeightKg,
    maximumWeightInclusive,
  }
}

export function validateClinicalRulePayload(input: unknown): ClinicalRuleValidation {
  if (!isRecord(input)) {
    return {
      valid: false,
      issues: [{ field: "payload", message: "Rule payload must be an object" }],
    }
  }
  const issues: ClinicalRuleValidationIssue[] = []
  const kind = input.kind
  if (isLegacyEquipmentRuleKind(kind)) {
    return {
      valid: false,
      issues: [{ field: "kind", message: FIXED_EQUIPMENT_RULE_REJECTION_MESSAGE }],
    }
  }
  // See RETIRED_AUTHORING_RULE_KINDS: a second dosing format that would bypass
  // the scope guard protecting drug profiles. Reading stays supported.
  if (isRetiredAuthoringRuleKind(kind)) {
    return {
      valid: false,
      issues: [{ field: "kind", message: RETIRED_DOSE_RULE_REJECTION_MESSAGE }],
    }
  }
  if (!CLINICAL_RULE_KINDS.includes(kind as ClinicalRuleKind)) {
    return {
      valid: false,
      issues: [{ field: "kind", message: "Unknown clinical rule kind" }],
    }
  }

  if (
    kind === "ADULT_DRUG_PROFILE"
    || kind === "ADULT_INFUSION_PROFILE"
    || kind === "ADULT_FLUID_PROFILE"
  ) {
    const itemKey = text(input, "itemKey", issues) ?? ""
    const labelEn = text(input, "labelEn", issues) ?? ""
    let profile: DoseProfile | null = null
    try {
      const doseKind = kind === "ADULT_DRUG_PROFILE"
        ? "bolus"
        : kind === "ADULT_INFUSION_PROFILE"
          ? "infusion"
          : "fluid"
      const parsed = parseDoseProfile(labelEn || itemKey || "Clinical rule", doseKind, input.profile)
      if (!parsed.routes.some(route => normalizeAdministrationRoute(route))) {
        issues.push({ field: "profile.routes", message: "At least one supported route is required" })
      } else {
        profile = canonicalizeDoseProfile(parsed)
      }
    } catch (error) {
      issues.push({
        field: "profile",
        message: error instanceof Error ? error.message : "Invalid dose profile",
      })
    }
    if (!profile) return { valid: false, issues }
    const metadata = canonicalDoseProfileMetadata(profile)
    const value: AdultDoseProfileRulePayload = {
      kind,
      itemKey,
      labelEn,
      labelBg: text(input, "labelBg", issues, { optional: true }),
      category: text(input, "category", issues, { optional: true }),
      profile: metadata.profile,
      unit: metadata.unit,
      routeUnits: metadata.routeUnits,
      ...(kind === "ADULT_DRUG_PROFILE"
        ? {
            availability: DRUG_PROFILE_AVAILABILITIES.includes(
              input.availability as DrugProfileAvailability,
            )
              ? input.availability as DrugProfileAvailability
              : "AUTO" as const,
          }
        : {}),
    }
    if (
      kind === "ADULT_DRUG_PROFILE"
      && input.availability != null
      && !DRUG_PROFILE_AVAILABILITIES.includes(input.availability as DrugProfileAvailability)
    ) {
      issues.push({ field: "availability", message: "Unknown drug availability" })
    }
    return issues.length ? { valid: false, issues } : { valid: true, value }
  }

  if (kind === "PEDIATRIC_DRUG_POLICY") {
    const disposition = input.disposition
    if (!PEDIATRIC_DRUG_POLICY_DISPOSITIONS.includes(
      disposition as PediatricDrugPolicyDisposition,
    )) {
      issues.push({ field: "disposition", message: "Unknown pediatric drug disposition" })
    }
    const reviewStatus = input.reviewStatus
    if (!PEDIATRIC_DRUG_POLICY_REVIEW_STATUSES.includes(
      reviewStatus as PediatricDrugPolicyReviewStatus,
    )) {
      issues.push({ field: "reviewStatus", message: "Unknown pediatric policy review status" })
    }
    const value: PediatricDrugPolicyRulePayload = {
      kind,
      medicationKey: text(input, "medicationKey", issues) ?? "",
      labelEn: text(input, "labelEn", issues) ?? "",
      labelBg: text(input, "labelBg", issues, { optional: true }),
      inn: text(input, "inn", issues, { optional: true }),
      category: text(input, "category", issues, { optional: true }),
      disposition: disposition as PediatricDrugPolicyDisposition,
      reviewStatus: reviewStatus as PediatricDrugPolicyReviewStatus,
      rationaleEn: text(input, "rationaleEn", issues, { maximum: 1000 }) ?? "",
      rationaleBg: text(input, "rationaleBg", issues, { optional: true, maximum: 1000 }),
    }
    return issues.length ? { valid: false, issues } : { valid: true, value }
  }

  const ageBand = validateAgeBand(input, issues)

  if (kind === "PEDIATRIC_INFUSION_PROFILE") {
    const itemKey = text(input, "itemKey", issues) ?? ""
    const labelEn = text(input, "labelEn", issues) ?? ""
    const disposition = input.disposition
    if (!PEDIATRIC_INFUSION_DISPOSITIONS.includes(
      disposition as PediatricInfusionDisposition,
    )) {
      issues.push({ field: "disposition", message: "Unknown pediatric infusion disposition" })
    }
    const routeDispositions: Record<string, PediatricInfusionDisposition> = {}
    if (!isRecord(input.routeDispositions)) {
      issues.push({ field: "routeDispositions", message: "Must be an object" })
    } else {
      for (const [rawRoute, rawDisposition] of Object.entries(input.routeDispositions)) {
        const route = normalizeAdministrationRoute(rawRoute)
        if (!route) {
          issues.push({ field: `routeDispositions.${rawRoute}`, message: "Unsupported route" })
          continue
        }
        if (!PEDIATRIC_INFUSION_DISPOSITIONS.includes(
          rawDisposition as PediatricInfusionDisposition,
        )) {
          issues.push({
            field: `routeDispositions.${rawRoute}`,
            message: "Unknown pediatric infusion disposition",
          })
          continue
        }
        routeDispositions[route] = rawDisposition as PediatricInfusionDisposition
      }
    }
    const routeManualEntryOnly: Record<string, boolean> = {}
    if (!isRecord(input.routeManualEntryOnly)) {
      issues.push({ field: "routeManualEntryOnly", message: "Must be an object" })
    } else {
      for (const [rawRoute, rawValue] of Object.entries(input.routeManualEntryOnly)) {
        const route = normalizeAdministrationRoute(rawRoute)
        if (!route) {
          issues.push({ field: `routeManualEntryOnly.${rawRoute}`, message: "Unsupported route" })
        } else if (typeof rawValue !== "boolean") {
          issues.push({ field: `routeManualEntryOnly.${rawRoute}`, message: "Must be a boolean" })
        } else {
          routeManualEntryOnly[route] = rawValue
        }
      }
    }
    let profile: DoseProfile | null = null
    if (input.profile != null) {
      try {
        const parsed = parseDoseProfile(
          labelEn || itemKey || "Pediatric infusion",
          "infusion",
          input.profile,
        )
        const unsupportedRoutes = parsed.routes.filter(route => !normalizeAdministrationRoute(route))
        if (unsupportedRoutes.length) {
          issues.push({
            field: "profile.routes",
            message: `Unsupported routes: ${unsupportedRoutes.join(", ")}`,
          })
        }
        profile = canonicalizeDoseProfile(parsed)
      } catch (error) {
        issues.push({
          field: "profile",
          message: error instanceof Error ? error.message : "Invalid pediatric infusion profile",
        })
      }
    }
    const typedDisposition = disposition as PediatricInfusionDisposition
    if (!profile && typedDisposition !== "LOCAL" && typedDisposition !== "HIDDEN") {
      issues.push({ field: "profile", message: "AUTO and MANUAL infusions require a selector profile" })
    }
    if (profile) {
      const knownRoutes = new Set(profile.routes)
      const unknownPolicyRoutes = Object.keys(routeDispositions)
        .filter(route => !knownRoutes.has(route))
      const unknownManualRoutes = Object.keys(routeManualEntryOnly)
        .filter(route => !knownRoutes.has(route))
      if (unknownPolicyRoutes.length || unknownManualRoutes.length) {
        issues.push({
          field: "routeDispositions",
          message: `Route policies must belong to profile routes: ${[
            ...unknownPolicyRoutes,
            ...unknownManualRoutes,
          ].join(", ")}`,
        })
      }
    }
    const manualUnit = text(input, "manualUnit", issues, { optional: true, maximum: 40 })
    if (manualUnit && !canonicalDoseUnit(manualUnit)) {
      issues.push({ field: "manualUnit", message: "Unsupported canonical dose/rate unit" })
    }
    const weightBand = validateWeightBand(input, issues)
    const metadata = profile
      ? canonicalDoseProfileMetadata(profile)
      : { profile: null, unit: null, routeUnits: {} }
    const value: PediatricInfusionProfileRulePayload = {
      kind,
      itemKey,
      labelEn,
      labelBg: text(input, "labelBg", issues, { optional: true }),
      category: text(input, "category", issues, { optional: true }),
      disposition: typedDisposition,
      routeDispositions,
      manualEntryOnly: booleanValue(input, "manualEntryOnly", issues, !profile),
      routeManualEntryOnly,
      profile: metadata.profile,
      unit: metadata.unit,
      routeUnits: metadata.routeUnits,
      manualUnit,
      ...weightBand,
      routineSuggestion: booleanValue(input, "routineSuggestion", issues, true),
      advisory: text(input, "advisory", issues, { optional: true, maximum: 1000 }),
      ...ageBand,
    }
    return issues.length ? { valid: false, issues } : { valid: true, value }
  }

  if (kind === "PEDIATRIC_FLUID_PROFILE") {
    const itemKey = text(input, "itemKey", issues) ?? ""
    const labelEn = text(input, "labelEn", issues) ?? ""
    const category = text(input, "category", issues, { optional: true })
    let profile: DoseProfile | null = null
    try {
      profile = canonicalizeDoseProfile(
        parseDoseProfile(labelEn || itemKey || "Pediatric fluid", "fluid", input.profile),
      )
      if (
        isBloodProductFluid({ name: labelEn || itemKey, category })
        && profile.fluidEntryModes?.includes("RATE")
      ) {
        issues.push({
          field: "profile.fluidEntryModes",
          message: "Blood products support volume entry only",
        })
      }
    } catch (error) {
      issues.push({
        field: "profile",
        message: error instanceof Error ? error.message : "Invalid pediatric fluid profile",
      })
    }
    if (!profile) return { valid: false, issues }
    const metadata = canonicalDoseProfileMetadata(profile)
    const value: PediatricFluidProfileRulePayload = {
      kind,
      itemKey,
      labelEn,
      labelBg: text(input, "labelBg", issues, { optional: true }),
      category,
      profile: metadata.profile,
      unit: metadata.unit,
      routeUnits: metadata.routeUnits,
      ...ageBand,
    }
    return issues.length ? { valid: false, issues } : { valid: true, value }
  }

  if (kind === "PEDIATRIC_DRUG_PROFILE") {
    const medicationKey = text(input, "medicationKey", issues) ?? ""
    const labelEn = text(input, "labelEn", issues) ?? ""
    const availability = input.availability == null
      ? "AUTO"
      : input.availability as DrugProfileAvailability
    if (!DRUG_PROFILE_AVAILABILITIES.includes(availability)) {
      issues.push({ field: "availability", message: "Unknown drug availability" })
    }
    let profile: DoseProfile | null = null
    if (input.profile != null) {
      try {
        const parsed = parseDoseProfile(labelEn || medicationKey || "Pediatric drug", "bolus", input.profile)
        const unsupportedRoutes = parsed.routes.filter(route => !normalizeAdministrationRoute(route))
        if (unsupportedRoutes.length) {
          issues.push({
            field: "profile.routes",
            message: `Unsupported routes: ${unsupportedRoutes.join(", ")}`,
          })
        }
        const canonicalRoutes = parsed.routes
          .map(route => normalizeAdministrationRoute(route))
          .filter((route): route is NonNullable<typeof route> => !!route)
        if (new Set(canonicalRoutes).size !== canonicalRoutes.length) {
          issues.push({ field: "profile.routes", message: "Routes must be unique after canonicalization" })
        }
        const routeModeRoutes = Object.keys(parsed.routeModes ?? {})
        const unknownModeRoutes = routeModeRoutes.filter(route => {
          const canonical = normalizeAdministrationRoute(route)
          return !canonical || !canonicalRoutes.includes(canonical)
        })
        if (unknownModeRoutes.length) {
          issues.push({
            field: "profile.routeModes",
            message: `Route profiles must belong to routes: ${unknownModeRoutes.join(", ")}`,
          })
        }
        profile = canonicalizeDoseProfile(parsed)
      } catch (error) {
        issues.push({
          field: "profile",
          message: error instanceof Error ? error.message : "Invalid pediatric drug profile",
        })
      }
    }
    if (!profile && availability !== "LOCAL" && availability !== "HIDDEN") {
      issues.push({ field: "profile", message: "AUTO and MANUAL drugs require a selector profile" })
    }
    if (profile && availability === "AUTO") {
      const defaultRoute = profile.defaultRoute || profile.routes[0]
      const defaultMode = defaultRoute ? profile.routeModes?.[defaultRoute] : undefined
      const calculation = defaultMode?.doseCalc
        ?? (defaultRoute ? profile.doseCalcByRoute?.[defaultRoute] : undefined)
        ?? profile.doseCalc
      if (!calculation) {
        issues.push({
          field: "profile.doseCalc",
          message: "AUTO drugs require a default dose calculation",
        })
      }
    }
    const manualUnit = text(input, "manualUnit", issues, { optional: true, maximum: 40 })
    if (manualUnit && !canonicalDoseUnit(manualUnit)) {
      issues.push({ field: "manualUnit", message: "Unsupported canonical dose unit" })
    }
    const weightBand = validateWeightBand(input, issues)
    const metadata = profile
      ? canonicalDoseProfileMetadata(profile)
      : { profile: null, unit: null, routeUnits: {} }
    const value: PediatricDrugProfileRulePayload = {
      kind,
      medicationKey,
      labelEn,
      labelBg: text(input, "labelBg", issues, { optional: true }),
      inn: text(input, "inn", issues, { optional: true }),
      category: text(input, "category", issues, { optional: true }),
      availability,
      profile: metadata.profile,
      unit: metadata.unit,
      routeUnits: metadata.routeUnits,
      manualUnit,
      ...weightBand,
      ...ageBand,
    }
    return issues.length ? { valid: false, issues } : { valid: true, value }
  }

  if (kind === "PEDIATRIC_DRUG_DOSE") {
    const basis = input.basis
    if (basis !== "TBW_KG" && basis !== "BSA_M2" && basis !== "FLAT") {
      issues.push({ field: "basis", message: "Unknown dose basis" })
    }
    const amountPerUnit = numberValue(input, "amountPerUnit", issues, {
      optional: basis === "FLAT",
      exclusiveMinimum: 0,
    })
    const flatAmount = numberValue(input, "flatAmount", issues, {
      optional: basis !== "FLAT",
      exclusiveMinimum: 0,
    })
    const minimumAmount = numberValue(input, "minimumAmount", issues, {
      optional: true,
      minimum: 0,
    })
    const maximumAmount = numberValue(input, "maximumAmount", issues, {
      optional: true,
      exclusiveMinimum: 0,
    })
    const roundTo = numberValue(input, "roundTo", issues, {
      optional: true,
      exclusiveMinimum: 0,
    })
    if (minimumAmount != null && maximumAmount != null && maximumAmount < minimumAmount) {
      issues.push({ field: "maximumAmount", message: "Must be at least minimumAmount" })
    }
    const value: PediatricDrugDoseRulePayload = {
      kind,
      medicationKey: text(input, "medicationKey", issues) ?? "",
      labelEn: text(input, "labelEn", issues) ?? "",
      labelBg: text(input, "labelBg", issues, { optional: true }),
      inn: text(input, "inn", issues, { optional: true }),
      indication: text(input, "indication", issues) ?? "",
      route: text(input, "route", issues) ?? "",
      basis: basis as PediatricDoseBasis,
      amountPerUnit,
      flatAmount,
      minimumAmount,
      maximumAmount,
      roundTo,
      doseUnit: text(input, "doseUnit", issues, { maximum: 40 }) ?? "",
      ...ageBand,
    }
    return issues.length ? { valid: false, issues } : { valid: true, value }
  }

  return {
    valid: false,
    issues: [{ field: "kind", message: "Unknown clinical rule kind" }],
  }
}

export type ClinicalRuleCollectionValidationIssue = {
  ruleKey?: string
  field: string
  message: string
}

export type ClinicalRuleCollectionValidation =
  | { valid: true; issues: [] }
  | { valid: false; issues: ClinicalRuleCollectionValidationIssue[] }

export function validateClinicalRuleCollection(
  rules: readonly Pick<ClinicalPresetRule, "ruleKey" | "payload">[],
): ClinicalRuleCollectionValidation {
  type PediatricProfileBandValidation = {
    ruleKey: string
    minimumAgeDays: number
    maximumAgeDaysExclusive: number
    minimumWeightKg: number | null
    minimumWeightInclusive: boolean
    maximumWeightKg: number | null
    maximumWeightInclusive: boolean
  }
  const issues: ClinicalRuleCollectionValidationIssue[] = []
  const keys = new Set<string>()
  const pediatricProfilesByItem = new Map<string, PediatricProfileBandValidation[]>()

  for (const rule of rules) {
    if (keys.has(rule.ruleKey)) {
      issues.push({ ruleKey: rule.ruleKey, field: "ruleKey", message: "Rule key must be unique" })
    }
    keys.add(rule.ruleKey)
    if (
      rule.payload.kind !== "PEDIATRIC_DRUG_PROFILE"
      && rule.payload.kind !== "PEDIATRIC_FLUID_PROFILE"
      && rule.payload.kind !== "PEDIATRIC_INFUSION_PROFILE"
    ) continue
    const payload = rule.payload
    const profile = payload.profile ? canonicalizeDoseProfile(payload.profile) : null
    if (profile) {
      if (!profile.defaultRoute || !profile.routes.includes(profile.defaultRoute)) {
        issues.push({
          ruleKey: rule.ruleKey,
          field: "profile.defaultRoute",
          message: "Default route must belong to routes",
        })
      }
      const hasBaseSurface = profile.min != null
        && profile.max != null
        && profile.unit != null
        && (profile.step != null || !!profile.variableStep?.length)
      for (const route of profile.routes) {
        if (!profile.routeModes?.[route] && !hasBaseSurface) {
          issues.push({
            ruleKey: rule.ruleKey,
            field: `profile.routeModes.${route}`,
            message: "Every route requires a complete route surface or a complete base surface",
          })
        }
      }
    }
    const itemKey = payload.kind === "PEDIATRIC_DRUG_PROFILE"
      ? payload.medicationKey
      : payload.itemKey
    const item = `${payload.kind}:${itemKey.trim().toUpperCase()}`
    const group = pediatricProfilesByItem.get(item) ?? []
    group.push({
      ruleKey: rule.ruleKey,
      minimumAgeDays: payload.minimumAgeDays,
      maximumAgeDaysExclusive: payload.maximumAgeDaysExclusive,
      minimumWeightKg: payload.kind === "PEDIATRIC_INFUSION_PROFILE"
        || payload.kind === "PEDIATRIC_DRUG_PROFILE"
        ? payload.minimumWeightKg ?? null
        : null,
      minimumWeightInclusive: payload.kind === "PEDIATRIC_INFUSION_PROFILE"
        || payload.kind === "PEDIATRIC_DRUG_PROFILE"
        ? payload.minimumWeightInclusive ?? true
        : true,
      maximumWeightKg: payload.kind === "PEDIATRIC_INFUSION_PROFILE"
        || payload.kind === "PEDIATRIC_DRUG_PROFILE"
        ? payload.maximumWeightKg ?? null
        : null,
      maximumWeightInclusive: payload.kind === "PEDIATRIC_INFUSION_PROFILE"
        || payload.kind === "PEDIATRIC_DRUG_PROFILE"
        ? payload.maximumWeightInclusive ?? false
        : false,
    })
    pediatricProfilesByItem.set(item, group)
  }

  function weightContains(
    profile: PediatricProfileBandValidation,
    weightKg: number,
  ): boolean {
    const aboveMinimum = profile.minimumWeightKg == null
      || weightKg > profile.minimumWeightKg
      || (profile.minimumWeightInclusive && weightKg === profile.minimumWeightKg)
    const belowMaximum = profile.maximumWeightKg == null
      || weightKg < profile.maximumWeightKg
      || (profile.maximumWeightInclusive && weightKg === profile.maximumWeightKg)
    return aboveMinimum && belowMaximum
  }

  function weightBandsOverlap(
    left: PediatricProfileBandValidation,
    right: PediatricProfileBandValidation,
  ): boolean {
    const lower = Math.max(left.minimumWeightKg ?? -Infinity, right.minimumWeightKg ?? -Infinity)
    const upper = Math.min(left.maximumWeightKg ?? Infinity, right.maximumWeightKg ?? Infinity)
    return lower < upper || (lower === upper && weightContains(left, lower) && weightContains(right, lower))
  }

  for (const profiles of pediatricProfilesByItem.values()) {
    profiles.sort((left, right) =>
      left.minimumAgeDays - right.minimumAgeDays
      || (left.minimumWeightKg ?? -Infinity) - (right.minimumWeightKg ?? -Infinity),
    )
    for (let index = 0; index < profiles.length; index += 1) {
      const current = profiles[index]
      if (!current) continue
      for (let comparison = 0; comparison < index; comparison += 1) {
        const previous = profiles[comparison]
        if (
          previous
          && current.minimumAgeDays < previous.maximumAgeDaysExclusive
          && previous.minimumAgeDays < current.maximumAgeDaysExclusive
          && weightBandsOverlap(previous, current)
        ) {
        issues.push({
          ruleKey: current.ruleKey,
          field: "minimumAgeDays",
          message: `Age band overlaps ${previous.ruleKey}`,
        })
        }
      }
    }
  }

  return issues.length ? { valid: false, issues } : { valid: true, issues: [] }
}

/**
 * Additional governance checks used only at publication time. Drafts may keep
 * pending ledger entries while evidence and local policy are being completed.
 */
export function validateClinicalRuleCollectionForPublication(
  rules: readonly Pick<ClinicalPresetRule, "ruleKey" | "payload">[],
): ClinicalRuleCollectionValidation {
  const base = validateClinicalRuleCollection(rules)
  const issues: ClinicalRuleCollectionValidationIssue[] = base.valid ? [] : [...base.issues]
  const profiles = new Set(
    rules.flatMap(rule => rule.payload.kind === "PEDIATRIC_DRUG_PROFILE"
      ? [keySegment(rule.payload.medicationKey)]
      : []),
  )
  for (const rule of rules) {
    if (rule.payload.kind !== "PEDIATRIC_DRUG_POLICY") continue
    const payload = rule.payload
    if (payload.reviewStatus !== "APPROVED") {
      issues.push({
        ruleKey: rule.ruleKey,
        field: "reviewStatus",
        message: "Pediatric drug policy must be approved before publication",
      })
    }
    if (payload.disposition === "PENDING_RESEARCH") {
      issues.push({
        ruleKey: rule.ruleKey,
        field: "disposition",
        message: "Pending-research drugs must be resolved before publication",
      })
    }
    if (
      (payload.disposition === "AUTOFILL_PROFILE"
        || payload.disposition === "MANUAL_PROFILE")
      && !profiles.has(keySegment(payload.medicationKey))
    ) {
      issues.push({
        ruleKey: rule.ruleKey,
        field: "disposition",
        message: "Profile disposition requires a pediatric drug profile",
      })
    }
  }

  return issues.length ? { valid: false, issues } : { valid: true, issues: [] }
}

function keySegment(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
}

function pediatricWeightBandKey(payload: PediatricRuleWeightBand): string {
  const minimum = payload.minimumWeightKg == null
    ? "ANY"
    : `${payload.minimumWeightInclusive === false ? "GT" : "GE"}${payload.minimumWeightKg}`
  const maximum = payload.maximumWeightKg == null
    ? "ANY"
    : `${payload.maximumWeightInclusive ? "LE" : "LT"}${payload.maximumWeightKg}`
  return `${minimum}-${maximum}`
}

export function clinicalRuleKey(payload: ClinicalRulePayload): string {
  if (
    payload.kind === "ADULT_DRUG_PROFILE"
    || payload.kind === "ADULT_INFUSION_PROFILE"
    || payload.kind === "ADULT_FLUID_PROFILE"
  ) {
    return `${payload.kind}:${keySegment(payload.itemKey)}`
  }
  if (payload.kind === "PEDIATRIC_DRUG_POLICY") {
    return `${payload.kind}:${keySegment(payload.medicationKey)}`
  }
  if (payload.kind === "PEDIATRIC_DRUG_PROFILE") {
    const base = [
      payload.kind,
      keySegment(payload.medicationKey),
      `${payload.minimumAgeDays}-${payload.maximumAgeDaysExclusive}`,
    ]
    if (payload.minimumWeightKg != null || payload.maximumWeightKg != null) {
      base.push(pediatricWeightBandKey(payload))
    }
    return base.join(":")
  }
  if (payload.kind === "PEDIATRIC_FLUID_PROFILE") {
    return [
      payload.kind,
      keySegment(payload.itemKey),
      `${payload.minimumAgeDays}-${payload.maximumAgeDaysExclusive}`,
    ].join(":")
  }
  if (payload.kind === "PEDIATRIC_INFUSION_PROFILE") {
    return [
      payload.kind,
      keySegment(payload.itemKey),
      `${payload.minimumAgeDays}-${payload.maximumAgeDaysExclusive}`,
      pediatricWeightBandKey(payload),
    ].join(":")
  }
  if (payload.kind === "PEDIATRIC_DRUG_DOSE") {
    return [
      payload.kind,
      keySegment(payload.medicationKey),
      keySegment(payload.indication),
      keySegment(payload.route),
      `${payload.minimumAgeDays}-${payload.maximumAgeDaysExclusive}`,
    ].join(":")
  }
  throw new Error(`Unsupported clinical rule kind: ${payload.kind}`)
}
