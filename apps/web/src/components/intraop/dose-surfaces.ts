"use client"

import { suggestedDoseFromWeights } from "@/lib/dose-calc"
import { resolveAdultDrugSelectorSurface } from "@/lib/drug-selector-surface"
import {
  resolveFluidDoseSelectorSurface,
  selectApplicablePediatricFluidProfile,
} from "@/lib/fluid-entry-ui"
import type { DoseProfile } from "@lospor/core/catalog"
import { normalizeAdministrationRoute } from "@lospor/core/clinical-rule-vocabulary"
import {
  applicablePediatricDrugProfiles,
  resolvePediatricDrugProfileSurface,
  resolvePediatricInfusionProfileSurface,
  selectApplicablePediatricDrugProfile,
  selectApplicablePediatricInfusionProfile,
  type AdultDoseProfileRule,
  type PediatricDrugProfileRule,
  type PediatricDrugSelectionResolution,
  type PediatricFluidProfileRule,
  type PediatricInfusionProfileRule,
  type PediatricInfusionSelectionResolution,
} from "@lospor/core/clinical-rules"
import {
  resolveDrugSelectionSurface,
  type DrugSelectionSurface,
} from "@lospor/core/drug-selection"
import type {
  LibraryOption,
  concentrationsMap,
  defaultConcentrationMap,
  doseCalcMap,
  quickNumberMap,
  routeProfilesMap,
  routesMap,
  strictRangeMap,
} from "@lospor/core/option-library"
import type { PediatricAgeUnit } from "@lospor/core/pediatric"
import { calculateMostellerBsa } from "@lospor/core/pediatric-calculators"

/**
 * How much of a drug or fluid the chart offers, and on what authority.
 *
 * Every dose the timetable suggests comes from here. The rules are layered, and
 * the order matters clinically: a paediatric profile that applies to this
 * patient wins, then an institution's adult profile, then the option library's
 * own numbers, then nothing — and "nothing" is a real answer. A drug marked
 * MANUAL, or one with a profile that cannot be resolved for this patient,
 * returns an empty dose and a `calculationUnavailableReason` rather than a
 * plausible-looking number, because a wrong autofill is worse than an empty
 * box someone has to think about.
 *
 * Two ambiguity rules run through the whole file. Where more than one profile
 * matches, nothing is chosen — `conflict` is returned and the caller shows the
 * conflict rather than picking one arbitrarily. And in paediatric mode there is
 * no adult fallback: `calcSuggestedDose` refuses outright, because falling back
 * to an adult dose for a child is the exact error this layer exists to prevent.
 *
 * Kept separate from the timetable so the arithmetic behind a dose can be read
 * and tested without a chart, a case, or a browser.
 */

export type PediatricAge = { value: number; unit: PediatricAgeUnit }

export type FluidRangeConfig = {
  min: number
  max: number
  step: number
  unit: string
  suggestedVolume?: number
}

export type DoseSurfaceInputs = {
  /** False unless the selected governed baseline passed the runtime safety gate. */
  guidanceEnabled: boolean
  isPediatric: boolean
  /** Null when the patient is an adult, or when age was not recorded. */
  pediatricAge: PediatricAge | null
  /** Ideal body weight, kg. */
  ibw?: number | null
  /** Total (actual) body weight, kg. */
  tbw?: number | null
  patientHeightCm?: number | null
  patientSex?: string | null

  pediatricDrugProfiles: readonly PediatricDrugProfileRule[]
  pediatricFluidProfiles: readonly PediatricFluidProfileRule[]
  pediatricInfusionProfiles: readonly PediatricInfusionProfileRule[]
  adultDoseProfiles: readonly AdultDoseProfileRule[]

  drugOptions: readonly LibraryOption[]
  bolusDoses: ReturnType<typeof doseCalcMap>
  bolusConfigs: ReturnType<typeof strictRangeMap>
  bolusRouteProfiles: ReturnType<typeof routeProfilesMap>
  infusionRouteProfiles: ReturnType<typeof routeProfilesMap>

  fluidConfigs: Record<string, FluidRangeConfig>
  fluidQuickVolumes: ReturnType<typeof quickNumberMap>
  fluidRoutes: ReturnType<typeof routesMap>
  fluidConcentrations: ReturnType<typeof concentrationsMap>
  fluidDefaultConcentrations: ReturnType<typeof defaultConcentrationMap>

  /** Shown instead of a number when paediatric dosing must be entered by hand. */
  manualDoseOnlyHint: string
}

export function createDoseSurfaces({
  guidanceEnabled,
  isPediatric,
  pediatricAge,
  ibw,
  tbw,
  patientHeightCm = null,
  patientSex = null,
  pediatricDrugProfiles,
  pediatricFluidProfiles,
  pediatricInfusionProfiles,
  adultDoseProfiles,
  drugOptions,
  bolusDoses,
  bolusConfigs,
  bolusRouteProfiles,
  infusionRouteProfiles,
  fluidConfigs,
  fluidQuickVolumes,
  fluidRoutes,
  fluidConcentrations,
  fluidDefaultConcentrations,
  manualDoseOnlyHint,
}: DoseSurfaceInputs) {
  function neutralRange(unit?: string | null) {
    if (unit === "g") return { min: 0, max: 100, step: 0.01 }
    if (unit === "mcg") return { min: 0, max: 100_000, step: 1 }
    return { min: 0, max: 100_000, step: 0.1 }
  }

  function manualDrugSurface<T extends DrugSelectionSurface>(surface: T): T {
    return {
      ...surface,
      ...neutralRange(surface.unit),
      dose: "",
      quickValues: [],
      concentrationOptions: [],
      concentration: "",
      formulationOptions: [],
      formulation: undefined,
      calculation: undefined,
      calculationUnavailableReason: "NO_AUTOFILL",
      ...(Object.hasOwn(surface, "suggestedRate") ? { suggestedRate: undefined } : {}),
      ...(Object.hasOwn(surface, "manualEntryOnly") ? { manualEntryOnly: true } : {}),
      ...(Object.hasOwn(surface, "advisory") ? { advisory: null } : {}),
    }
  }

  function pediatricProfilesFor(medicationKey: string): PediatricDrugProfileRule[] {
    return applicablePediatricDrugProfiles({
      medicationKey,
      age: pediatricAge,
      weightKg: tbw,
      profiles: pediatricDrugProfiles,
    })
  }

  function pediatricProfileResolution(profile: PediatricDrugProfileRule, route?: string) {
    const surface = pediatricAge
      ? resolvePediatricDrugProfileSurface({
          rule: profile,
          age: pediatricAge,
          route,
          weightKg: tbw,
          heightCm: patientHeightCm,
          sex: patientSex,
        })
      : null
    return surface && !guidanceEnabled ? manualDrugSurface(surface) : surface
  }

  function pediatricSurfaceFor(name: string, route?: string): PediatricDrugSelectionResolution | null {
    const { profile } = selectApplicablePediatricDrugProfile({
      medicationKey: name,
      age: pediatricAge,
      weightKg: tbw,
      profiles: pediatricDrugProfiles,
    })
    return profile ? pediatricProfileResolution(profile, route) : null
  }

  // Thin wrapper over the shared pure dosing logic (src/lib/dose-calc.ts).
  // Per-route override (Ketamine IV/IM/IN/PO, Lidocaine IV) takes priority;
  // IBW basis is capped at the patient's actual weight inside the helper.
  function calcSuggestedDose(name: string, ibwKg: number | null, tbwKg: number | null, route?: string): { dose: string; hint: string } {
    if (!guidanceEnabled) return { dose: "", hint: "" }
    if (isPediatric) {
      return {
        dose: "",
        hint: manualDoseOnlyHint,
      }
    }
    const entry = bolusDoses[name]
    const matchingRoute = route && entry?.byRoute
      ? Object.keys(entry.byRoute).find(candidate => (
          (normalizeAdministrationRoute(candidate) ?? candidate) === route
        )) ?? route
      : route
    return suggestedDoseFromWeights(entry, matchingRoute, ibwKg, tbwKg)
  }

  function bolusRange(name: string, unit: string) {
    if (!guidanceEnabled) return neutralRange(unit)
    if (isPediatric) {
      if (unit === "mcg") return { min:0, max:100000, step:1 }
      if (unit === "g") return { min:0, max:100, step:0.01 }
      if (unit === "ml") return { min:0, max:1000, step:0.1 }
      return { min:0, max:100000, step:0.1 }
    }
    if (bolusConfigs[name]) return bolusConfigs[name]
    if (unit === "mcg") return { min:0, max:2000, step:10 }
    if (unit === "g")   return { min:0, max:10,   step:0.5 }
    if (unit === "ml")  return { min:0, max:100,  step:1 }
    if (unit === "IU")  return { min:0, max:200,  step:5 }
    return { min:0, max:500, step:5 }
  }

  // Resolve the effective per-route surface for a drug/infusion, merging the
  // route's profile (if any) over the flat fields. Returns undefined when the
  // drug has no routeModes so callers fall back to their flat lookups.
  function bolusRouteSurface(name: string, route?: string) {
    if (!route) return undefined
    const profiles = bolusRouteProfiles[name]
    const key = profiles
      ? Object.keys(profiles).find(candidate => (
          (normalizeAdministrationRoute(candidate) ?? candidate) === route
        ))
      : undefined
    const profile = key ? profiles[key] : undefined
    return profile && !guidanceEnabled ? {
      ...profile,
      ...neutralRange(profile.unit),
      quickValues: [],
      concentrationOptions: [],
      defaultConcentration: undefined,
      formulationOptions: [],
    } : profile
  }
  function infusionRouteSurface(name: string, route?: string) {
    if (!route) return undefined
    const profiles = infusionRouteProfiles[name]
    const key = profiles
      ? Object.keys(profiles).find(candidate => (
          (normalizeAdministrationRoute(candidate) ?? candidate) === route
        ))
      : undefined
    const profile = key ? profiles[key] : undefined
    return profile && !guidanceEnabled ? {
      ...profile,
      min: 0,
      max: 100_000,
      step: 0.1,
      quickValues: [],
      concentrationOptions: [],
      defaultConcentration: undefined,
      formulationOptions: [],
      suggestedRate: undefined,
      suggestedConcentration: undefined,
    } : profile
  }
  function adultRuleForAny(
    name: string,
    kind: "ADULT_DRUG_PROFILE" | "ADULT_INFUSION_PROFILE" = "ADULT_DRUG_PROFILE",
  ) {
    const normalized = name.trim().toUpperCase()
    return adultDoseProfiles.find(rule => (
      rule.kind === kind
      && [rule.itemKey, rule.labelEn, rule.labelBg]
        .some(value => value?.trim().toUpperCase() === normalized)
    ))
  }

  function adultRuleFor(name: string) {
    const rule = adultRuleForAny(name)
    return rule?.availability === "HIDDEN" ? undefined : rule
  }

  function clinicalPediatricInfusionFor(
    name: string,
    route?: string | null,
  ): {
    rule: PediatricInfusionProfileRule | null
    surface: PediatricInfusionSelectionResolution | null
    conflict: boolean
  } {
    if (!isPediatric) return { rule: null, surface: null, conflict: false }
    const { profile, conflict } = selectApplicablePediatricInfusionProfile({
      itemKey: name,
      age: pediatricAge,
      weightKg: tbw,
      profiles: pediatricInfusionProfiles,
    })
    if (!profile) return { rule: null, surface: null, conflict }
    return {
      rule: profile,
      surface: (() => {
        const surface = resolvePediatricInfusionProfileSurface({ rule: profile, route })
        return guidanceEnabled ? surface : manualDrugSurface(surface)
      })(),
      conflict: false,
    }
  }

  function clinicalFluidProfileFor(name: string): {
    profile: DoseProfile | null
    conflict: boolean
    clinicalRuleKey?: string
    clinicalRuleVersion?: string
    clinicalRuleSourceIds?: string[]
  } {
    if (isPediatric) {
      const selection = selectApplicablePediatricFluidProfile({
        itemKey: name,
        age: pediatricAge,
        profiles: pediatricFluidProfiles,
      })
      return {
        profile: selection.profile?.profile ?? null,
        conflict: selection.conflict,
        clinicalRuleKey: selection.profile?.ruleKey,
        clinicalRuleVersion: selection.profile?.ruleVersion,
        clinicalRuleSourceIds: selection.profile ? [...selection.profile.sourceIds] : undefined,
      }
    }
    const normalized = name.trim().toUpperCase()
    const matches = adultDoseProfiles.filter(rule => (
      rule.kind === "ADULT_FLUID_PROFILE"
      && [rule.itemKey, rule.labelEn]
        .some(value => value.trim().toUpperCase() === normalized)
    ))
    return {
      profile: matches.length === 1 ? matches[0]?.profile ?? null : null,
      conflict: matches.length > 1,
      clinicalRuleKey: matches.length === 1 ? matches[0]?.ruleKey : undefined,
      clinicalRuleVersion: matches.length === 1 ? matches[0]?.ruleVersion : undefined,
    }
  }

  function fluidDoseSurface(name: string, route?: string | null) {
    const clinicalProfile = clinicalFluidProfileFor(name)
    const config = fluidConfigs[name] ?? {
      min: 0,
      max: 2000,
      step: 50,
      unit: "mL",
      suggestedVolume: undefined,
    }
    const surface = resolveFluidDoseSelectorSurface({
      profile: clinicalProfile.profile,
      route,
      fallback: {
        min: config.min,
        max: config.max,
        step: config.step,
        quickValues: fluidQuickVolumes[name] ?? [],
        unit: config.unit,
        routes: fluidRoutes[name] ?? ["IV"],
        concentrationOptions: fluidConcentrations[name] ?? [],
        defaultConcentration: fluidDefaultConcentrations[name],
        suggestedVolume: config.suggestedVolume,
      },
    })
    return {
      ...clinicalProfile,
      surface: guidanceEnabled ? surface : {
        ...surface,
        min: 0,
        max: 100_000,
        step: 0.1,
        quickValues: [],
        concentrationOptions: [],
        defaultConcentration: undefined,
        suggestedVolume: 0,
      },
    }
  }

  function adultBolusSurface(name: string, route?: string): DrugSelectionSurface | null {
    const adultRule = adultRuleFor(name)
    if (adultRule) {
      if (adultRule.availability === "LOCAL") {
        const configuredRoute = route
          ?? adultRule.profile.defaultRoute
          ?? adultRule.profile.routes[0]
          ?? "IV"
        const route0 = normalizeAdministrationRoute(configuredRoute) ?? configuredRoute
        return {
          route: route0,
          routes: [route0],
          mode: "dose",
          min: 0,
          max: 100_000,
          step: 0.1,
          quickValues: [],
          unit: adultRule.profile.unit ?? "mg",
          dose: "",
          concentrationOptions: [],
          concentration: "",
          formulationOptions: [],
          calculationUnavailableReason: "NO_AUTOFILL",
        }
      }
      const bsa = patientHeightCm != null && tbw != null
        ? calculateMostellerBsa({ heightCm: patientHeightCm, weightKg: tbw })
        : null
      const surface = resolveDrugSelectionSurface({
        profile: adultRule.profile,
        route,
        allowWeightBasisFallback: true,
        patient: {
          totalBodyWeightKg: tbw,
          idealBodyWeightKg: ibw,
          idealBodyWeightMethod: "DEVINE_1974",
          bodySurfaceAreaM2: bsa?.available ? bsa.value.squareMetres : null,
        },
      })
      const selected: DrugSelectionSurface = adultRule.availability === "MANUAL"
        ? { ...surface, dose: "", calculation: undefined, calculationUnavailableReason: "NO_AUTOFILL" }
        : surface
      return guidanceEnabled ? selected : manualDrugSurface(selected)
    }

    // Old cached platform snapshots can predate the canonical profile fields.
    // Keep them readable while all new snapshots use the shared resolver.
    const option = drugOptions.find(candidate => candidate.label === name)
    const legacy = resolveAdultDrugSelectorSurface(option, route)
    if (!legacy) return null
    const suggested = legacy.suggestedValue != null
      ? String(legacy.suggestedValue)
      : calcSuggestedDose(name, ibw ?? null, tbw ?? null, legacy.route).dose
    const surface: DrugSelectionSurface = {
      route: legacy.route,
      routes: legacy.routes,
      mode: legacy.concentrationOptions.length ? "concentration" : "dose",
      min: legacy.min,
      max: legacy.max,
      step: legacy.step,
      quickValues: legacy.quickValues,
      unit: legacy.unit,
      dose: suggested,
      concentrationOptions: legacy.concentrationOptions,
      concentration: legacy.concentration ?? "",
      concentrationUnit: legacy.concentrationUnit,
      formulationOptions: legacy.formulationOptions,
      formulation: legacy.formulation,
      ...(!suggested ? { calculationUnavailableReason: "NO_AUTOFILL" as const } : {}),
    }
    return guidanceEnabled ? surface : manualDrugSurface(surface)
  }

  function calculationAuditFromSurface(surface: DrugSelectionSurface) {
    const basis = surface.calculation?.basis
    return {
      calculationBasis: basis,
      calculationWeightKg: basis === "TBW" || basis === "IBW"
        ? surface.calculation?.calculationWeight
        : undefined,
      calculationMethod: surface.calculation?.calculationMethod
        ?? (basis === "TBW"
          ? "TOTAL_BODY_WEIGHT"
          : basis === "BSA_M2"
            ? "MOSTELLER_BSA_M2"
            : basis === "FLAT"
              ? "PROFILE_FLAT"
              : undefined),
    }
  }

  function adultDoseAudit(name: string, surface: DrugSelectionSurface) {
    const adultRule = adultRuleFor(name)
    const ruleAudit = adultRule ? {
      clinicalRuleKey: adultRule.ruleKey,
      clinicalRuleVersion: adultRule.ruleVersion,
    } : {}
    return {
      ...ruleAudit,
      ...calculationAuditFromSurface(surface),
    }
  }

  return {
    guidanceEnabled,
    pediatricProfilesFor,
    pediatricProfileResolution,
    pediatricSurfaceFor,
    calcSuggestedDose,
    bolusRange,
    bolusRouteSurface,
    infusionRouteSurface,
    adultRuleForAny,
    adultRuleFor,
    clinicalPediatricInfusionFor,
    clinicalFluidProfileFor,
    fluidDoseSurface,
    adultBolusSurface,
    calculationAuditFromSurface,
    adultDoseAudit,
  }
}
