import {
  normalizeAdministrationRoute,
} from "../clinical-rule-vocabulary"
import {
  type DrugSelectionSurface,
  resolveDrugSelectionSurface,
} from "../drug-selection"
import {
  resolveIdealBodyWeight,
} from "../ideal-body-weight"
import {
  type PediatricAgeInput,
  normalizePediatricAge,
} from "../pediatric"
import {
  calculateMostellerBsa,
} from "../pediatric-calculators"
import {
  pediatricWeightMatches,
} from "./internal"
import {
  type PediatricDrugProfileRule,
  type PediatricFluidProfileRule,
  type PediatricInfusionProfileRule,
} from "./pediatric-profiles"
import {
  type ClinicalRuleOrigin,
  type DrugProfileAvailability,
  type PediatricInfusionDisposition,
} from "./types"

export function applicablePediatricInfusionProfiles(input: {
  itemKey: string
  age: PediatricAgeInput | null
  weightKg?: number | null
  profiles: readonly PediatricInfusionProfileRule[]
}): PediatricInfusionProfileRule[] {
  if (!input.age) return []
  const age = normalizePediatricAge(input.age)
  if (!age) return []
  const key = input.itemKey.trim().toUpperCase()
  return input.profiles
    .filter(profile =>
      (profile.itemKey.trim().toUpperCase() === key
        || profile.labelEn.trim().toUpperCase() === key)
      && age.approximateDays >= profile.minimumAgeDays
      && age.approximateDays < profile.maximumAgeDaysExclusive
      && pediatricWeightMatches(profile, input.weightKg)
    )
    .sort((left, right) =>
      left.minimumAgeDays - right.minimumAgeDays
      || (left.minimumWeightKg ?? -Infinity) - (right.minimumWeightKg ?? -Infinity),
    )
}

export type PediatricInfusionSelectionResolution = DrugSelectionSurface & {
  disposition: PediatricInfusionDisposition
  suggestedRate?: number
  manualEntryOnly: boolean
  routineSuggestion: boolean
  advisory: string | null
  ruleKey: string
  ruleVersion: string
  sourceIds: string[]
  origin: ClinicalRuleOrigin
  presetId: string
}

export function resolvePediatricInfusionProfileSurface(input: {
  rule: PediatricInfusionProfileRule
  route?: string | null
}): PediatricInfusionSelectionResolution {
  const profile = input.rule.profile
  const requestedRoute = input.route ? normalizeAdministrationRoute(input.route) : null
  const route = requestedRoute && profile?.routes.includes(requestedRoute)
    ? requestedRoute
    : profile?.defaultRoute ?? profile?.routes[0] ?? requestedRoute ?? "IV"
  const disposition = input.rule.routeDispositions[route] ?? input.rule.disposition
  const manualEntryOnly = input.rule.routeManualEntryOnly[route]
    ?? input.rule.manualEntryOnly
  const surface = profile
    ? resolveDrugSelectionSurface({ profile, route })
    : {
        route,
        routes: Object.keys(input.rule.routeDispositions).length
          ? Object.keys(input.rule.routeDispositions)
          : [route],
        mode: "rate" as const,
        min: 0,
        max: 100_000,
        step: 0.1,
        quickValues: [],
        unit: input.rule.manualUnit ?? "",
        dose: "",
        concentrationOptions: [],
        concentration: "",
        formulationOptions: [],
      }
  const routeProfile = profile?.routeModes?.[surface.route]
  const suggestedRate = disposition === "AUTO"
    ? routeProfile?.suggestedRate ?? profile?.suggestedRate
    : undefined
  return {
    ...surface,
    disposition,
    ...(suggestedRate == null ? {} : { suggestedRate }),
    manualEntryOnly,
    routineSuggestion: input.rule.routineSuggestion,
    advisory: input.rule.advisory,
    ruleKey: input.rule.ruleKey,
    ruleVersion: input.rule.ruleVersion,
    sourceIds: [...input.rule.sourceIds],
    origin: input.rule.origin,
    presetId: input.rule.presetId,
  }
}

export function applicablePediatricFluidProfiles(input: {
  itemKey: string
  age: PediatricAgeInput | null
  profiles: readonly PediatricFluidProfileRule[]
}): PediatricFluidProfileRule[] {
  if (!input.age) return []
  const age = normalizePediatricAge(input.age)
  if (!age) return []
  const key = input.itemKey.trim().toUpperCase()
  return input.profiles
    .filter(profile =>
      (profile.itemKey.trim().toUpperCase() === key
        || profile.labelEn.trim().toUpperCase() === key)
      && age.approximateDays >= profile.minimumAgeDays
      && age.approximateDays < profile.maximumAgeDaysExclusive
    )
    .sort((left, right) => left.minimumAgeDays - right.minimumAgeDays)
}

export function applicablePediatricDrugProfiles(input: {
  medicationKey: string
  age: PediatricAgeInput | null
  weightKg?: number | null
  profiles: readonly PediatricDrugProfileRule[]
}): PediatricDrugProfileRule[] {
  if (!input.age) return []
  const age = normalizePediatricAge(input.age)
  if (!age) return []
  const key = input.medicationKey.trim().toUpperCase()
  return input.profiles
    .filter(profile =>
      (profile.medicationKey.trim().toUpperCase() === key
        || profile.labelEn.trim().toUpperCase() === key)
      && age.approximateDays >= profile.minimumAgeDays
      && age.approximateDays < profile.maximumAgeDaysExclusive
      && pediatricWeightMatches(profile, input.weightKg)
    )
    .sort((left, right) =>
      left.minimumAgeDays - right.minimumAgeDays
      || (left.minimumWeightKg ?? -Infinity) - (right.minimumWeightKg ?? -Infinity),
    )
}

export type PediatricDrugSelectionResolution = DrugSelectionSurface & {
  availability: DrugProfileAvailability
  manualEntryOnly: boolean
  ruleKey: string
  ruleVersion: string
  sourceIds: string[]
  origin: ClinicalRuleOrigin
  presetId: string
}

export function resolvePediatricDrugProfileSurface(input: {
  rule: PediatricDrugProfileRule
  age: PediatricAgeInput
  route?: string | null
  weightKg?: number | null
  heightCm?: number | null
  sex?: string | null
  idealBodyWeightKg?: number | null
  preterm?: boolean | null
}): PediatricDrugSelectionResolution | null {
  const availability = input.rule.availability ?? "AUTO"
  const age = normalizePediatricAge(input.age)
  if (
    !age
    || age.approximateDays < input.rule.minimumAgeDays
    || age.approximateDays >= input.rule.maximumAgeDaysExclusive
    || !pediatricWeightMatches(input.rule, input.weightKg)
    || availability === "HIDDEN"
  ) return null
  if (availability === "LOCAL" || !input.rule.profile) {
    const requestedRoute = input.route ? normalizeAdministrationRoute(input.route) : null
    const route = requestedRoute ?? "IV"
    return {
      route,
      routes: [route],
      mode: "dose",
      min: 0,
      max: 100_000,
      step: 0.1,
      quickValues: [],
      unit: input.rule.manualUnit ?? "",
      dose: "",
      concentrationOptions: [],
      concentration: "",
      formulationOptions: [],
      calculationUnavailableReason: "NO_AUTOFILL",
      availability,
      manualEntryOnly: true,
      ruleKey: input.rule.ruleKey,
      ruleVersion: input.rule.ruleVersion,
      sourceIds: [...input.rule.sourceIds],
      origin: input.rule.origin,
      presetId: input.rule.presetId,
    }
  }
  const bsa = input.heightCm != null && input.weightKg != null
    ? calculateMostellerBsa({ heightCm: input.heightCm, weightKg: input.weightKg })
    : null
  const resolvedIbw = input.idealBodyWeightKg == null
    ? resolveIdealBodyWeight({
        clinicalMode: "PEDIATRIC",
        heightCm: input.heightCm,
        sex: input.sex,
        age: input.age,
        preterm: input.preterm,
      })
    : null
  const idealBodyWeightKg = input.idealBodyWeightKg
    ?? (resolvedIbw?.available ? resolvedIbw.kilograms : null)
  const surface = resolveDrugSelectionSurface({
    profile: input.rule.profile,
    route: input.route,
    patient: {
      totalBodyWeightKg: input.weightKg,
      bodySurfaceAreaM2: bsa?.available ? bsa.value.squareMetres : null,
      idealBodyWeightKg,
      idealBodyWeightMethod: idealBodyWeightKg == null
        ? null
        : resolvedIbw?.available
          ? resolvedIbw.method
          : "MCLAREN_CDC_2000",
    },
    // A paediatric band spans a wide range of sizes, so its authored quick
    // values are sized for the largest child it covers. Keep only the ones this
    // child could plausibly receive; the slider and manual entry are unchanged.
    clampQuickValuesToCalculatedDose: true,
  })
  return {
    ...surface,
    ...(availability === "MANUAL"
      ? {
          dose: "",
          calculation: undefined,
          calculationUnavailableReason: "NO_AUTOFILL" as const,
        }
      : {}),
    availability,
    manualEntryOnly: false,
    ruleKey: input.rule.ruleKey,
    ruleVersion: input.rule.ruleVersion,
    sourceIds: [...input.rule.sourceIds],
    origin: input.rule.origin,
    presetId: input.rule.presetId,
  }
}
