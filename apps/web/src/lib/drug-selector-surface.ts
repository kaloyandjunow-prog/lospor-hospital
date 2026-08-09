import {
  metadataNumber,
  metadataNumbers,
  metadataObject,
  metadataString,
  metadataStrings,
  type JsonObject,
} from "@lospor/core/option-contracts"
import {
  normalizeAdministrationRoute,
} from "@lospor/core/clinical-rule-vocabulary"
import type { LibraryOption } from "@lospor/core/option-library"
import {
  LOCAL_ANAESTHETIC_FORMULATIONS,
  type LocalAnaestheticFormulation,
} from "@lospor/core/catalog"
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

function canonicalRoute(route: string): string {
  return normalizeAdministrationRoute(route) ?? route
}

function uniqueRoutes(routes: readonly string[]): string[] {
  return [...new Set(routes.map(canonicalRoute))]
}

function matchingRouteEntry(
  routeModes: JsonObject | null,
  route: string,
): JsonObject | null {
  if (!routeModes) return null
  const exact = metadataObject(routeModes, route)
  if (exact) return exact
  const entry = Object.entries(routeModes).find(([candidate]) => canonicalRoute(candidate) === route)
  return entry ? metadataObject(routeModes, entry[0]) : null
}

function firstVariableStep(metadata: JsonObject | null | undefined): number | undefined {
  const variableStep = metadata?.variableStep
  if (!Array.isArray(variableStep)) return undefined
  for (const entry of variableStep) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue
    const step = metadataNumber(entry as JsonObject, "step")
    if (step != null) return step
  }
  return undefined
}

function formulationOptions(metadata: JsonObject | null | undefined): LocalAnaestheticFormulation[] {
  return metadataStrings(metadata, "formulationOptions").filter(
    (value): value is LocalAnaestheticFormulation => (
      LOCAL_ANAESTHETIC_FORMULATIONS.includes(value as LocalAnaestheticFormulation)
    ),
  )
}

function numberForRoute(
  metadata: JsonObject | null | undefined,
  key: string,
  route: string,
): number | undefined {
  const byRoute = metadataObject(metadata, key)
  if (!byRoute) return undefined
  const exact = metadataNumber(byRoute, route)
  if (exact != null) return exact
  const entry = Object.entries(byRoute).find(([candidate]) => canonicalRoute(candidate) === route)
  return entry && typeof entry[1] === "number" && Number.isFinite(entry[1])
    ? entry[1]
    : undefined
}

function resolveDefaultRoute(metadata: JsonObject, routes: string[]): string {
  const configured = metadataString(metadata, "defaultRoute")
  const candidate = configured ? canonicalRoute(configured) : routes[0]
  return candidate && routes.includes(candidate) ? candidate : routes[0] ?? "IV"
}

export function resolveAdultDrugSelectorSurface(
  option: Pick<LibraryOption, "metadata"> | null | undefined,
  requestedRoute?: string,
): DrugSelectorSurface | null {
  const metadata = option?.metadata
  if (!metadata) return null

  const configuredRoutes = metadataStrings(metadata, "routes")
  const routeModes = metadataObject(metadata, "routeModes")
  const modeRoutes = routeModes ? Object.keys(routeModes) : []
  const routes = uniqueRoutes(configuredRoutes.length ? configuredRoutes : modeRoutes.length ? modeRoutes : ["IV"])
  const defaultRoute = resolveDefaultRoute(metadata, routes)
  const requestedCanonical = requestedRoute ? canonicalRoute(requestedRoute) : defaultRoute
  const route = routes.includes(requestedCanonical) ? requestedCanonical : defaultRoute
  const routeMode = matchingRouteEntry(routeModes, route)

  const unit = metadataString(routeMode, "unit") ?? metadataString(metadata, "unit")
  const min = metadataNumber(routeMode, "min") ?? metadataNumber(metadata, "min")
  const max = metadataNumber(routeMode, "max") ?? metadataNumber(metadata, "max")
  const step = metadataNumber(routeMode, "step")
    ?? firstVariableStep(routeMode)
    ?? metadataNumber(metadata, "step")
    ?? firstVariableStep(metadata)
  if (!unit || min == null || max == null || step == null) return null

  const routeQuickValues = metadataNumbers(routeMode, "quickValues")
  const baseQuickValues = metadataNumbers(metadata, "quickValues")
  const quickValues = Array.isArray(routeMode?.quickValues) ? routeQuickValues : baseQuickValues
  const routeConcentrations = metadataStrings(routeMode, "concentrationOptions")
  const baseConcentrations = metadataStrings(metadata, "concentrationOptions")
  const concentrationOptions = Array.isArray(routeMode?.concentrationOptions)
    ? routeConcentrations
    : baseConcentrations
  const configuredConcentration = metadataString(routeMode, "defaultConcentration")
    ?? metadataString(routeMode, "suggestedConcentration")
    ?? metadataString(metadata, "defaultConcentration")
    ?? metadataString(metadata, "suggestedConcentration")
  const concentration = configuredConcentration
    ?? concentrationOptions[0]
  const concentrationUnit = metadataString(routeMode, "concentrationUnit")
    ?? metadataString(metadata, "concentrationUnit")

  const routeFormulations = formulationOptions(routeMode)
  const baseFormulations = formulationOptions(metadata)
  const availableFormulations = Array.isArray(routeMode?.formulationOptions)
    ? routeFormulations
    : baseFormulations
  const configuredFormulation = metadataString(routeMode, "defaultFormulation")
    ?? metadataString(metadata, "defaultFormulation")
  const formulation = availableFormulations.includes(configuredFormulation as LocalAnaestheticFormulation)
    ? configuredFormulation as LocalAnaestheticFormulation
    : availableFormulations[0]

  const suggestedValue = metadataNumber(routeMode, "suggestedValue")
    ?? metadataNumber(routeMode, "suggestedDose")
    ?? metadataNumber(routeMode, "suggestedVolume")
    ?? numberForRoute(metadata, "suggestedVolumeByRoute", route)
    ?? metadataNumber(metadata, "suggestedValue")
    ?? metadataNumber(metadata, "suggestedDose")
    ?? metadataNumber(metadata, "suggestedVolume")

  return {
    route,
    routes,
    unit,
    min,
    max,
    step,
    quickValues,
    concentrationOptions,
    concentration,
    concentrationUnit,
    formulationOptions: availableFormulations,
    formulation,
    suggestedValue,
  }
}
