import type { createDoseSurfaces } from "./dose-surfaces"
import type { FConflictAnchor, TtFP } from "./timetable-types"
import { fluidClinicalRuleAudit, resolveFluidSelectorDefaults } from "@/lib/fluid-entry-ui"
import { FLUID_CAT_COLOR } from "@/lib/timetable-fluid-rows"
import {
  visiblePediatricInfusionRoutes,
} from "@lospor/core/clinical-rules"

/**
 * What the quick-entry flyout opens with.
 *
 * Tapping a cell on the chart is the moment a dose is proposed, and whatever
 * appears in that box is what a tired anaesthetist will accept. So the opening
 * state is decided here, in one place, rather than assembled from whichever
 * lookup happened to be in scope.
 *
 * The precedence is the same one the dose layer uses — a paediatric profile for
 * this patient, then an adult profile, then the route's own surface, then the
 * option library, then a bare default. What is specific to opening is the rest
 * of it: which routes may be offered, whether the box may be typed into at all,
 * and which rule gets the credit in the audit trail when several could claim it.
 *
 * Returning null means the drug is hidden for this patient and the flyout must
 * not open. That is a real outcome, not a failure — a rule can withdraw a drug,
 * and the tap has to do nothing rather than fall back to a generic dose.
 */

export const DEFAULT_INF = {
  units: ["mg/hr", "mcg/kg/min", "ml/hr"],
  min: 0,
  max: 100,
  step: 1,
  color: "#64748b",
}

export type InfusionConfig = {
  units: string[]
  min: number
  max: number
  step: number
  color: string
  suggestedRate?: number
}

export type FlyoutPreset = {
  id: string | null
  version: number | null
  scope: "PLATFORM" | "INSTITUTION" | "USER" | null
}

type Surfaces = ReturnType<typeof createDoseSurfaces>

function presetAuditFrom(preset: FlyoutPreset) {
  return preset.id && preset.version && preset.scope
    ? {
        clinicalPresetId: preset.id,
        clinicalPresetVersion: preset.version,
        clinicalPresetScope: preset.scope,
      }
    : {}
}

export type DrugFlyoutInputs = {
  guidanceEnabled: boolean
  col: number
  name: string
  /** The unit the chart already holds, used when no profile names one. */
  unit: string
  mode: "bolus" | "infusion"
  anchor: FConflictAnchor
  surfaces: Surfaces
  isPediatric: boolean
  ibw?: number | null
  tbw?: number | null
  infusionConfigs: Record<string, InfusionConfig>
  infusionRoutes: Record<string, string[]>
  drugRoutes: Record<string, string[]>
  quickDoses: Record<string, number[]>
  quickRates: Record<string, number[]>
  preset: FlyoutPreset
  /** Set only when the clinician deliberately selected a routine-hidden search result. */
  manualOnlyOverride?: boolean
}

/** Null when a rule hides this drug for this patient — the flyout must not open. */
export function buildDrugFlyoutState({
  guidanceEnabled,
  col,
  name,
  unit,
  mode,
  anchor,
  surfaces,
  isPediatric,
  ibw,
  tbw,
  infusionConfigs,
  infusionRoutes,
  drugRoutes,
  quickDoses,
  quickRates,
  preset,
  manualOnlyOverride = false,
}: DrugFlyoutInputs): TtFP | null {
  const cfg = infusionConfigs[name]
  const pediatricProfiles = isPediatric && mode === "bolus" ? surfaces.pediatricProfilesFor(name) : []
  const pediatricSurface = pediatricProfiles.length === 1
    ? surfaces.pediatricProfileResolution(pediatricProfiles[0])
    : null
  const hiddenPediatricProfile = pediatricProfiles.find(profile => profile.availability === "HIDDEN")
  const pediatricInfusion = mode === "infusion"
    ? surfaces.clinicalPediatricInfusionFor(name)
    : { rule: null, surface: null, conflict: false }
  const pediatricInfusionIsHidden = pediatricInfusion.surface?.disposition === "HIDDEN"
  const hiddenPediatricInfusion = pediatricInfusionIsHidden
    ? pediatricInfusion.rule
    : null
  const adultRule = !isPediatric
    ? surfaces.adultRuleForAny(
        name,
        mode === "infusion" ? "ADULT_INFUSION_PROFILE" : "ADULT_DRUG_PROFILE",
      )
    : undefined
  const hiddenAdultRule = adultRule?.availability === "HIDDEN" ? adultRule : undefined
  const isRoutineHidden = !!hiddenPediatricProfile || pediatricInfusionIsHidden || !!hiddenAdultRule
  if (isRoutineHidden && !manualOnlyOverride) return null
  if (isRoutineHidden) {
    const routes = mode === "infusion"
      ? infusionRoutes[name] ?? ["IV"]
      : drugRoutes[name] ?? ["IV"]
    const hiddenRule = hiddenPediatricProfile ?? hiddenPediatricInfusion ?? hiddenAdultRule
    const sourceIds = hiddenRule && "sourceIds" in hiddenRule
      ? [...hiddenRule.sourceIds]
      : undefined
    return {
      col,
      name,
      unit,
      mode,
      dose: "",
      doseHint: "",
      rate: 0,
      rateUnit: cfg?.units[0] ?? unit,
      rateUnits: cfg?.units.length ? cfg.units : [unit],
      rateMin: 0,
      rateMax: 100_000,
      rateStep: 0.1,
      color: cfg?.color ?? DEFAULT_INF.color,
      manualEntryOnly: true,
      searchOnlyManualEntry: true,
      calculationUnavailableReason: "NO_AUTOFILL",
      clinicalRuleKey: hiddenRule?.ruleKey,
      clinicalRuleVersion: hiddenRule?.ruleVersion,
      clinicalRuleSourceIds: sourceIds,
      ...presetAuditFrom(preset),
      routes,
      route: routes[0] ?? "IV",
      anchor,
    }
  }
  const adultSurface = !isPediatric && mode === "bolus" ? surfaces.adultBolusSurface(name) : null
  const bolusSurface = pediatricSurface ?? adultSurface
  // A ruleset can withdraw one route rather than the whole drug; core decides
  // which survive, so the phone offers the same list.
  const pediatricInfusionRoutes = pediatricInfusion.rule
    ? visiblePediatricInfusionRoutes(pediatricInfusion.rule)
    : null
  const routes = bolusSurface?.routes
    ?? (mode === "infusion"
      ? pediatricInfusionRoutes?.length
        ? pediatricInfusionRoutes
        : (infusionRoutes[name] ?? ["IV"])
      : (drugRoutes[name] ?? ["IV"]))
  const route0 = bolusSurface?.route ?? pediatricInfusion.surface?.route ?? routes[0]
  const pediatricInfusionSurface = mode === "infusion"
    ? surfaces.clinicalPediatricInfusionFor(name, route0).surface
    : null
  const sugg = isPediatric
    ? { dose: pediatricSurface?.dose ?? "", hint: "" }
    : surfaces.calcSuggestedDose(name, ibw ?? null, tbw ?? null, route0)
  // Per-route surfaces let route-varying drugs open with their correct adult defaults.
  // Pediatric boluses use only the assigned published preset plus approved local changes.
  const isurf = mode === "infusion" && !pediatricInfusionSurface
    ? surfaces.infusionRouteSurface(name, route0)
    : undefined
  const bsurf = mode === "bolus" ? surfaces.bolusRouteSurface(name, route0) : undefined
  const adultAudit = !isPediatric && mode === "bolus" && adultSurface
    ? surfaces.adultDoseAudit(name, adultSurface)
    : null
  const pediatricAudit = pediatricSurface ? {
    ...surfaces.calculationAuditFromSurface(pediatricSurface),
    clinicalRuleKey: pediatricSurface.ruleKey,
    clinicalRuleVersion: pediatricSurface.ruleVersion,
    clinicalRuleSourceIds: pediatricSurface.sourceIds,
  } : null
  const pediatricInfusionAudit = pediatricInfusionSurface ? {
    clinicalRuleKey: pediatricInfusionSurface.ruleKey,
    clinicalRuleVersion: pediatricInfusionSurface.ruleVersion,
    clinicalRuleSourceIds: pediatricInfusionSurface.sourceIds,
  } : null

  const state: TtFP = {
    col,
    name,
    unit: bolusSurface?.unit ?? bsurf?.unit ?? unit,
    mode,
    dose: bolusSurface?.dose ?? sugg.dose,
    doseHint: sugg.hint,
    rate: pediatricInfusionSurface?.suggestedRate ?? (isPediatric ? 0 : isurf?.suggestedRate ?? cfg?.suggestedRate ?? isurf?.min ?? cfg?.min ?? 0),
    rateUnit: pediatricInfusionSurface?.unit ?? isurf?.unit ?? cfg?.units[0] ?? "mg/hr",
    rateUnits: pediatricInfusionSurface
      ? [pediatricInfusionSurface.unit]
      : isurf ? [isurf.unit] : cfg?.units ?? DEFAULT_INF.units,
    rateMin: pediatricInfusionSurface?.min ?? (isPediatric ? 0 : isurf?.min ?? cfg?.min ?? DEFAULT_INF.min),
    rateMax: pediatricInfusionSurface?.max ?? (isPediatric ? 100000 : isurf?.max ?? cfg?.max ?? DEFAULT_INF.max),
    rateStep: pediatricInfusionSurface?.step ?? (isPediatric ? 0.1 : isurf?.step ?? cfg?.step ?? DEFAULT_INF.step),
    color: cfg?.color ?? DEFAULT_INF.color,
    concentration: isPediatric
      ? pediatricInfusionSurface?.concentration || pediatricSurface?.concentration || undefined
      : mode === "bolus"
        ? adultSurface?.concentration || undefined
        : isurf?.suggestedConcentration,
    concentrationUnitHint: mode === "bolus" ? bolusSurface?.concentrationUnit : pediatricInfusionSurface?.concentrationUnit,
    concentrationOptions: mode === "infusion" ? pediatricInfusionSurface?.concentrationOptions : undefined,
    formulation: mode === "bolus" ? bolusSurface?.formulation : pediatricInfusionSurface?.formulation,
    formulationOptions: mode === "infusion" ? pediatricInfusionSurface?.formulationOptions : undefined,
    manualEntryOnly: mode === "bolus" && isPediatric
      ? pediatricSurface?.manualEntryOnly ?? true
      : pediatricInfusionSurface?.manualEntryOnly,
    advisory: pediatricInfusionSurface?.advisory ?? undefined,
    calculationBasis: pediatricAudit?.calculationBasis ?? adultAudit?.calculationBasis,
    calculationWeightKg: pediatricAudit?.calculationWeightKg ?? adultAudit?.calculationWeightKg,
    calculationMethod: pediatricAudit?.calculationMethod ?? adultAudit?.calculationMethod,
    calculationUnavailableReason: bolusSurface?.calculationUnavailableReason,
    clinicalRuleKey: pediatricAudit?.clinicalRuleKey ?? pediatricInfusionAudit?.clinicalRuleKey ?? adultAudit?.clinicalRuleKey,
    clinicalRuleVersion: pediatricAudit?.clinicalRuleVersion ?? pediatricInfusionAudit?.clinicalRuleVersion ?? adultAudit?.clinicalRuleVersion,
    clinicalRuleSourceIds: pediatricAudit?.clinicalRuleSourceIds ?? pediatricInfusionAudit?.clinicalRuleSourceIds,
    ...presetAuditFrom(preset),
    quickDoses: bolusSurface?.quickValues
      ?? (isPediatric ? undefined : bsurf?.quickValues ?? quickDoses[name]),
    quickRates: pediatricInfusionSurface?.quickValues ?? (isPediatric ? undefined : isurf?.quickValues ?? quickRates[name]),
    routes,
    route: route0,
    anchor,
  }
  return guidanceEnabled ? state : {
    ...state,
    dose: "",
    doseHint: "",
    rate: 0,
    rateMin: 0,
    rateMax: 100_000,
    rateStep: 0.1,
    quickDoses: [],
    quickRates: [],
    concentration: undefined,
    concentrationOptions: undefined,
    concentrationUnitHint: undefined,
    formulation: undefined,
    formulationOptions: undefined,
    advisory: undefined,
    calculationBasis: undefined,
    calculationWeightKg: undefined,
    calculationMethod: undefined,
    calculationUnavailableReason: "NO_AUTOFILL",
    manualEntryOnly: true,
  }
}

export type FluidFlyoutInputs = {
  guidanceEnabled: boolean
  col: number
  name: string
  category: string
  anchor: FConflictAnchor
  surfaces: Surfaces
  clinicalMode: "ADULT" | "PEDIATRIC"
  ibw?: number | null
  tbw?: number | null
  /** Fallback colour when the fluid's category has none. */
  fluidColor: (name: string) => string
  preset: FlyoutPreset
}

export function buildFluidFlyoutState({
  guidanceEnabled,
  col,
  name,
  category,
  anchor,
  surfaces,
  clinicalMode,
  ibw,
  tbw,
  fluidColor,
  preset,
}: FluidFlyoutInputs): TtFP {
  const {
    profile,
    conflict,
    surface,
    clinicalRuleKey,
    clinicalRuleVersion,
    clinicalRuleSourceIds,
  } = surfaces.fluidDoseSurface(name)
  const concentration = surface.defaultConcentration
  const defaults = guidanceEnabled
    ? resolveFluidSelectorDefaults({
        clinicalMode,
        name,
        category,
        concentration,
        profile,
        totalBodyWeightKg: tbw,
        mclarenIdealBodyWeightKg: ibw,
        useIdealBodyWeight: false,
      })
    : {
        defaultMode: "VOLUME" as const,
        availableModes: ["VOLUME" as const],
        rate: "",
        rateHint: undefined,
        rateProfile: { min: 0, max: 100_000, step: 0.1 },
      }

  const state: TtFP = {
    col,
    name,
    unit: surface.unit,
    mode: "fluid",
    dose: String(surface.suggestedVolume),
    doseHint: "",
    fluidScale: "L",
    rate: 0,
    rateUnit: "ml",
    rateUnits: ["ml"],
    rateMin: 0,
    rateMax: 2000,
    rateStep: 50,
    fluidEntryMode: defaults.defaultMode,
    fluidEntryModes: defaults.availableModes,
    fluidRate: defaults.rate,
    fluidRateHint: defaults.rateHint,
    fluidRateMin: defaults.rateProfile.min,
    fluidRateMax: defaults.rateProfile.max,
    fluidRateStep: defaults.rateProfile.step,
    fluidBagMin: surface.min,
    fluidBagMax: surface.max,
    fluidBagStep: surface.step,
    fluidConcentrations: surface.concentrationOptions,
    fluidProfileConflict: conflict,
    ...fluidClinicalRuleAudit({
      ruleKey: clinicalRuleKey,
      ruleVersion: clinicalRuleVersion,
      sourceIds: clinicalRuleSourceIds,
      presetId: preset.id,
      presetVersion: preset.version,
      presetScope: preset.scope,
    }),
    color: FLUID_CAT_COLOR[category] ?? fluidColor(name),
    concentration,
    quickDoses: surface.quickValues,
    routes: surface.routes,
    route: surface.route,
    anchor,
  }
  return guidanceEnabled ? state : {
    ...state,
    dose: "",
    quickDoses: [],
    concentration: undefined,
    fluidConcentrations: [],
    fluidRate: "",
    fluidRateHint: undefined,
    fluidRateMin: 0,
    fluidRateMax: 100_000,
    fluidRateStep: 0.1,
    fluidBagMin: 0,
    fluidBagMax: 100_000,
    fluidBagStep: 0.1,
    calculationUnavailableReason: "NO_AUTOFILL",
    manualEntryOnly: true,
  }
}
