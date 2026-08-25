import {
  canonicalDoseUnit,
  normalizeAdministrationRoute,
} from "@lospor/core/clinical-rule-vocabulary"
import {
  resolvePediatricDrugProfileSurface,
  type PediatricDrugProfileRule,
} from "@lospor/core/clinical-rules"
import type { PediatricAgeInput } from "@lospor/core/pediatric"
import type { PediatricDoseProfile } from "@lospor/core/pediatric-dose"
import { calcSuggestedDose as calcDose } from "@/lib/dose-calc"
import { resolvePediatricProfileDose } from "@/lib/pediatric-dose-ui"
import type { DrugEntryDraft, DrugRuleSelection } from "@/lib/use-drug-entry"
import type { DrugPickerOption } from "@/components/intraop/DrugPickerMenu"
import type { DoseCalc, DoseSurface } from "@/components/intraop/drug-sheet-types"

/**
 * Turning "this drug, by this route" into the values the dose sheet opens with.
 *
 * Split out of DrugSheet.tsx, which had grown past its size budget. These are
 * the parts that answer a question about the catalogue and the patient rather
 * than about the screen: which route spelling is canonical, which dose surface
 * governs, and what a fresh draft therefore contains. None of them touch React
 * state, so they are a factory over the case's clinical context rather than a
 * hook — DrugSheet keeps ownership of what is currently selected.
 *
 * The pediatric/adult split is deliberate and load-bearing. A pediatric draft
 * carries the rule that produced its dose so the event can credit it; where no
 * single band applies, `pediatricDraft` is called with no candidates, which
 * yields an empty dose and no rule rather than a guess.
 */
export type DrugDraftContext = {
  pediatricMode: boolean
  patientAge: PediatricAgeInput | null
  patientWeightKg?: number
  patientHeightCm?: number
  patientSex?: string
  routes: Record<string, string[]>
  baseProfiles: Record<string, DoseSurface>
  routeProfiles: Record<string, Record<string, DoseSurface>>
  laConcentrations: Record<string, string[]>
  dosePresets: Record<string, number[]>
  doseCalcs?: Record<string, DoseCalc>
}

export type DrugDraftBuilders = {
  canonicalRoute: (route: string | undefined) => string | undefined
  canonicalUnit: (unit: string) => string
  canonicalRoutes: (name: string) => string[]
  profileForRoute: (name: string, route: string | undefined) => DoseSurface | undefined
  calculatedPrefill: (name: string, route?: string) => string
  pediatricDraft: (
    drug: DrugPickerOption,
    route: string | undefined,
    candidates: readonly PediatricDoseProfile[],
  ) => DrugEntryDraft
  structuredPediatricDraft: (
    drug: DrugPickerOption,
    route: string | undefined,
    profile: PediatricDrugProfileRule,
  ) => DrugEntryDraft
  adultDraft: (drug: DrugPickerOption, route: string | undefined) => DrugEntryDraft
}

function ruleFromProfile(profile: PediatricDoseProfile): DrugRuleSelection {
  return {
    key: profile.key,
    version: profile.version,
    sourceIds: [...profile.sourceIds],
    roundTo: profile.roundTo,
  }
}

function ruleFromStructuredProfile(
  profile: PediatricDrugProfileRule,
  route: string,
): DrugRuleSelection {
  const routeMode = profile.profile?.routeModes?.[route]
  const doseCalc = routeMode?.doseCalc
    ?? profile.profile?.doseCalcByRoute?.[route]
    ?? profile.profile?.doseCalc
  return {
    key: profile.ruleKey,
    version: profile.ruleVersion,
    sourceIds: [...profile.sourceIds],
    roundTo: doseCalc?.roundTo,
  }
}

export function createDrugDraftBuilders(context: DrugDraftContext): DrugDraftBuilders {
  const {
    pediatricMode, patientAge, patientWeightKg, patientHeightCm, patientSex,
    routes, baseProfiles, routeProfiles, laConcentrations, dosePresets, doseCalcs,
  } = context

  function canonicalRoute(route: string | undefined): string | undefined {
    return route ? normalizeAdministrationRoute(route) ?? route : undefined
  }

  function canonicalUnit(unit: string): string {
    return canonicalDoseUnit(unit)?.display ?? unit
  }

  function canonicalRoutes(name: string): string[] {
    return Array.from(new Set((routes[name] ?? []).map(route => canonicalRoute(route) ?? route)))
  }

  function profileForRoute(name: string, route: string | undefined): DoseSurface | undefined {
    const canonical = canonicalRoute(route)
    const routeSurfaces = routeProfiles[name] ?? {}
    if (canonical && routeSurfaces[canonical]) return routeSurfaces[canonical]
    const aliasMatch = canonical
      ? Object.entries(routeSurfaces).find(([candidate]) => canonicalRoute(candidate) === canonical)?.[1]
      : undefined
    return aliasMatch ?? baseProfiles[name]
  }

  function calculatedPrefill(name: string, route?: string): string {
    if (pediatricMode) return ""
    return calcDose(doseCalcs?.[name], route, {
      weightKg: patientWeightKg,
      heightCm: patientHeightCm,
      sex: patientSex,
    }).dose
  }

  function pediatricDraft(
    drug: DrugPickerOption,
    route: string | undefined,
    candidates: readonly PediatricDoseProfile[],
  ): DrugEntryDraft {
    const canonical = canonicalRoute(route)
    const matching = candidates.filter(profile => canonicalRoute(profile.route) === canonical)
    const profile = matching.length === 1 ? matching[0] : undefined
    const resolution = profile && patientAge
      ? resolvePediatricProfileDose({
          profile,
          age: patientAge,
          weightKg: patientWeightKg,
          heightCm: patientHeightCm,
        })
      : null
    return {
      pick: { ...drug, unit: canonicalUnit(profile?.doseUnit ?? drug.unit) },
      dose: resolution?.status === "AVAILABLE" ? String(resolution.amount) : "",
      route: canonical,
      rule: profile ? ruleFromProfile(profile) : undefined,
    }
  }

  function structuredPediatricDraft(
    drug: DrugPickerOption,
    route: string | undefined,
    profile: PediatricDrugProfileRule,
  ): DrugEntryDraft {
    if (!patientAge) {
      const fallbackRoute = canonicalRoute(route)
        ?? canonicalRoute(profile.profile?.defaultRoute)
        ?? canonicalRoute(profile.profile?.routes[0])
      return {
        pick: { ...drug, unit: canonicalUnit(profile.profile?.unit ?? profile.manualUnit ?? drug.unit) },
        dose: "",
        route: fallbackRoute,
        rule: fallbackRoute ? ruleFromStructuredProfile(profile, fallbackRoute) : undefined,
      }
    }
    const surface = resolvePediatricDrugProfileSurface({
      rule: profile,
      age: patientAge,
      route,
      weightKg: patientWeightKg,
      heightCm: patientHeightCm,
      sex: patientSex,
    })
    if (!surface) return { pick: drug, dose: "", route: canonicalRoute(route) }
    return {
      pick: { ...drug, unit: canonicalUnit(surface.unit) },
      // Preserve only the calculated prefill. If its basis is unavailable (for
      // example McLaren IBW cannot be resolved), keep the dose manual instead
      // of substituting a configured quick value.
      dose: surface.dose,
      route: surface.route,
      concentration: surface.concentration || undefined,
      formulation: surface.formulation,
      rule: ruleFromStructuredProfile(profile, surface.route),
    }
  }

  function adultDraft(drug: DrugPickerOption, route: string | undefined): DrugEntryDraft {
    const canonical = canonicalRoute(route)
    const profile = profileForRoute(drug.name, canonical)
    const concentrations = profile?.mode === "concentration"
      ? profile.concentrationOptions ?? laConcentrations[drug.name] ?? []
      : []
    const doseSuggestion = calculatedPrefill(drug.name, canonical)
    const routeVolume = canonical ? profile?.suggestedVolumeByRoute?.[canonical] : undefined
    const fallbackDose = routeVolume
      ?? profile?.suggestedVolume
      ?? profile?.quickValues?.[0]
      ?? dosePresets[drug.name]?.[0]
    return {
      pick: { ...drug, unit: canonicalUnit(profile?.unit ?? drug.unit) },
      dose: doseSuggestion || (fallbackDose != null ? String(fallbackDose) : ""),
      route: canonical,
      concentration: concentrations.length
        ? profile?.suggestedConcentration ?? profile?.defaultConcentration ?? concentrations[0]
        : undefined,
      formulation: profile?.defaultFormulation ?? profile?.formulationOptions?.[0],
    }
  }

  return {
    canonicalRoute,
    canonicalUnit,
    canonicalRoutes,
    profileForRoute,
    calculatedPrefill,
    pediatricDraft,
    structuredPediatricDraft,
    adultDraft,
  }
}
