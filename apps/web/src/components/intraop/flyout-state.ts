import type { createDoseSurfaces } from "./dose-surfaces"
import type { FConflictAnchor, TtFP } from "./timetable-types"
import { fluidClinicalRuleAudit, resolveFluidSelectorDefaults } from "@/lib/fluid-entry-ui"
import { FLUID_CAT_COLOR } from "@/lib/timetable-fluid-rows"
import {
  resolvePediatricInfusionProfileSurface,
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
}

/** Null when a rule hides this drug for this patient — the flyout must not open. */
export function buildDrugFlyoutState({
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
}: DrugFlyoutInputs): TtFP | null {
  const cfg = infusionConfigs[name]
  const pediatricProfiles = isPediatric && mode === "bolus" ? surfaces.pediatricProfilesFor(name) : []
  const pediatricSurface = pediatricProfiles.length === 1
    ? surfaces.pediatricProfileResolution(pediatricProfiles[0])
    : null
  if (pediatricProfiles.some(profile => profile.availability === "HIDDEN")) return null
  const pediatricInfusion = mode === "infusion"
    ? surfaces.clinicalPediatricInfusionFor(name)
    : { rule: null, surface: null, conflict: false }
  if (pediatricInfusion.surface?.disposition === "HIDDEN") return null
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
  const pediatricInfusionSurface = pediatricInfusion.rule
    ? resolvePediatricInfusionProfileSurface({ rule: pediatricInfusion.rule, route: route0 })
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

  return {
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
}

export type FluidFlyoutInputs = {
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
  const defaults = resolveFluidSelectorDefaults({
    clinicalMode,
    name,
    category,
    concentration,
    profile,
    totalBodyWeightKg: tbw,
    mclarenIdealBodyWeightKg: ibw,
    useIdealBodyWeight: false,
  })

  return {
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
}
