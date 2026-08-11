import { resolveOptionDoseSurface } from "@lospor/core/option-surface"
import type { LibraryOption } from "@lospor/core/option-library"
import type { LocalAnaestheticFormulation } from "@lospor/core/catalog"
import type { DrugSelectionSurface } from "@lospor/core/drug-selection"

export type { LocalAnaestheticFormulation } from "@lospor/core/catalog"

export type DrugSelectorSurface = {
  route: string
  routes: string[]
  unit: string
  min: number
  max: number
  step: number
  quickValues: number[]
  concentrationOptions: string[]
  concentration?: string
  concentrationUnit?: string
  formulationOptions: LocalAnaestheticFormulation[]
  formulation?: LocalAnaestheticFormulation
  suggestedValue?: number
}

export type DrugSelectorAtomicState = {
  route: string
  routes: string[]
  dose: string
  unit: string
  quickDoses: number[]
  concentration?: string
  concentrationUnitHint?: string
  customConc: string
  formulation?: LocalAnaestheticFormulation
  calculationUnavailableReason?: DrugSelectionSurface["calculationUnavailableReason"]
}

export function drugSelectorAtomicState(
  surface: DrugSelectionSurface,
): DrugSelectorAtomicState {
  return {
    route: surface.route,
    routes: [...surface.routes],
    dose: surface.dose,
    unit: surface.unit,
    quickDoses: [...surface.quickValues],
    concentration: surface.concentration || undefined,
    concentrationUnitHint: surface.concentrationUnit,
    customConc: "",
    formulation: surface.formulation,
    calculationUnavailableReason: surface.calculationUnavailableReason,
  }
}

/**
 * The adult fallback for options whose metadata predates the canonical profile
 * fields.
 *
 * The reading itself — which field wins, what a missing one falls back to — now
 * lives in @lospor/core/option-surface, so the phone applies the same rules.
 * What stays here is the one judgement specific to this fallback: a page
 * missing any of unit, range or step cannot produce a usable dose box, and an
 * incomplete surface is worse than none, so it returns null and the caller
 * shows an empty field instead.
 */
export function resolveAdultDrugSelectorSurface(
  option: Pick<LibraryOption, "metadata"> | null | undefined,
  requestedRoute?: string,
): DrugSelectorSurface | null {
  const surface = resolveOptionDoseSurface({ metadata: option?.metadata, route: requestedRoute })
  if (!surface) return null

  const { unit, min, max, step } = surface
  if (!unit || min == null || max == null || step == null) return null

  return {
    route: surface.route,
    routes: surface.routes,
    unit,
    min,
    max,
    step,
    quickValues: surface.quickValues,
    concentrationOptions: surface.concentrationOptions,
    concentration: surface.concentration,
    concentrationUnit: surface.concentrationUnit,
    formulationOptions: surface.formulationOptions,
    formulation: surface.formulation,
    suggestedValue: surface.suggestedValue,
  }
}
