import {
  metadataNumber,
  metadataNumbers,
  metadataObject,
  metadataString,
  metadataStrings,
  type JsonObject,
} from "./option-contracts"
import { normalizeAdministrationRoute } from "./clinical-rule-vocabulary"
import {
  LOCAL_ANAESTHETIC_FORMULATIONS,
  type LocalAnaestheticFormulation,
} from "./catalog"

/**
 * How to read a drug's page in the option library.
 *
 * Each option carries a blob of metadata — units, ranges, routes, strengths —
 * and every app needs the same numbers out of it. Both the web chart and the
 * phone used to have their own reader, written separately, and they agreed on
 * the ordinary cases and differed on the awkward ones: which field wins when a
 * page states two, and what to fall back on when a page leaves something out.
 *
 * Nothing went wrong, because no option in the shipped catalogue exercises those
 * cases. But the option library is data — a hospital can author its own — so the
 * disagreement was waiting for the first page that used one of these fields.
 *
 * The rules, decided once:
 *
 * - A route's own entry beats the drug's base entry, for every field. A page
 *   that says "5 mg, except 2 mg intranasally" means 2 mg intranasally.
 * - `default*` beats `suggested*`. "Default" states what the field is;
 *   "suggested" is advisory, and the explicit statement should win.
 * - Routes are canonicalised before anything is matched, so a page authored as
 *   "intravenous" and a chart holding "IV" are the same route.
 * - Missing is missing: a field nobody authored comes back undefined rather
 *   than as a plausible number. Callers decide whether that is fatal.
 */

export type OptionDoseSurface = {
  /** The resolved route this surface describes. */
  route: string
  routes: string[]
  unit?: string
  min?: number
  max?: number
  step?: number
  quickValues: number[]
  concentrationOptions: string[]
  concentration?: string
  concentrationUnit?: string
  formulationOptions: LocalAnaestheticFormulation[]
  formulation?: LocalAnaestheticFormulation
  /** A single pre-filled amount, whatever the page called it. */
  suggestedValue?: number
  suggestedVolume?: number
  suggestedVolumeByRoute?: Record<string, number>
  suggestedRate?: number
}

function canonicalRoute(route: string): string {
  return normalizeAdministrationRoute(route) ?? route
}

function uniqueRoutes(routes: readonly string[]): string[] {
  return [...new Set(routes.map(canonicalRoute))]
}

/** The route's own entry, matched on the canonical form rather than the spelling. */
function routeEntry(routeModes: JsonObject | null, route: string): JsonObject | null {
  if (!routeModes) return null
  const exact = metadataObject(routeModes, route)
  if (exact) return exact
  const entry = Object.entries(routeModes).find(([candidate]) => canonicalRoute(candidate) === route)
  return entry ? metadataObject(routeModes, entry[0]) : null
}

/**
 * The step from a variable-step ladder.
 *
 * Scans for the first rung that declares one rather than trusting rung zero: a
 * ladder whose first rung omits its step would otherwise fall through to a
 * default of 1, which is the wrong granularity for most drugs.
 */
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
  return entry && typeof entry[1] === "number" && Number.isFinite(entry[1]) ? entry[1] : undefined
}

function volumeByRoute(metadata: JsonObject | null | undefined): Record<string, number> | undefined {
  const raw = metadataObject(metadata, "suggestedVolumeByRoute")
  if (!raw) return undefined
  const entries = Object.entries(raw).flatMap(([route, value]) => (
    typeof value === "number" && Number.isFinite(value)
      ? [[canonicalRoute(route), value] as const]
      : []
  ))
  return entries.length ? Object.fromEntries(entries) : undefined
}

export function resolveOptionRoutes(metadata: JsonObject | null | undefined): {
  routes: string[]
  defaultRoute: string
} {
  const configured = metadataStrings(metadata, "routes")
  const routeModes = metadataObject(metadata, "routeModes")
  const modeRoutes = routeModes ? Object.keys(routeModes) : []
  const routes = uniqueRoutes(
    configured.length ? configured : modeRoutes.length ? modeRoutes : ["IV"],
  )
  const declared = metadataString(metadata, "defaultRoute")
  const candidate = declared ? canonicalRoute(declared) : routes[0]
  return {
    routes,
    // A declared default that is not among the routes is an authoring mistake;
    // fall back rather than offering a route the drug cannot be given by.
    defaultRoute: candidate && routes.includes(candidate) ? candidate : routes[0] ?? "IV",
  }
}

export function resolveOptionDoseSurface(input: {
  metadata: JsonObject | null | undefined
  /** The route being asked about; the drug's default when omitted. */
  route?: string
}): OptionDoseSurface | null {
  const metadata = input.metadata
  if (!metadata) return null

  const { routes, defaultRoute } = resolveOptionRoutes(metadata)
  const requested = input.route ? canonicalRoute(input.route) : defaultRoute
  const route = routes.includes(requested) ? requested : defaultRoute
  const mode = routeEntry(metadataObject(metadata, "routeModes"), route)

  // A route may state a list or omit it; an omitted list means "as the drug
  // says", which is not the same as an authored empty list.
  const listForRoute = <T>(key: string, read: (m: JsonObject | null | undefined) => T[]): T[] =>
    Array.isArray(mode?.[key]) ? read(mode) : read(metadata)

  const availableFormulations = listForRoute("formulationOptions", formulationOptions)
  const declaredFormulation = metadataString(mode, "defaultFormulation")
    ?? metadataString(mode, "suggestedFormulation")
    ?? metadataString(metadata, "defaultFormulation")
    ?? metadataString(metadata, "suggestedFormulation")
  const formulation = availableFormulations.includes(declaredFormulation as LocalAnaestheticFormulation)
    ? declaredFormulation as LocalAnaestheticFormulation
    : availableFormulations[0]

  const concentrationOptions = listForRoute("concentrationOptions", m => metadataStrings(m, "concentrationOptions"))
  const declaredConcentration = metadataString(mode, "defaultConcentration")
    ?? metadataString(mode, "suggestedConcentration")
    ?? metadataString(metadata, "defaultConcentration")
    ?? metadataString(metadata, "suggestedConcentration")

  return {
    route,
    routes,
    unit: metadataString(mode, "unit") ?? metadataString(metadata, "unit"),
    min: metadataNumber(mode, "min") ?? metadataNumber(metadata, "min"),
    max: metadataNumber(mode, "max") ?? metadataNumber(metadata, "max"),
    step: metadataNumber(mode, "step")
      ?? firstVariableStep(mode)
      ?? metadataNumber(metadata, "step")
      ?? firstVariableStep(metadata),
    quickValues: listForRoute("quickValues", m => metadataNumbers(m, "quickValues")),
    concentrationOptions,
    concentration: declaredConcentration ?? concentrationOptions[0],
    concentrationUnit: metadataString(mode, "concentrationUnit")
      ?? metadataString(metadata, "concentrationUnit"),
    formulationOptions: availableFormulations,
    formulation,
    suggestedValue: metadataNumber(mode, "suggestedValue")
      ?? metadataNumber(mode, "suggestedDose")
      ?? metadataNumber(mode, "suggestedVolume")
      ?? numberForRoute(metadata, "suggestedVolumeByRoute", route)
      ?? metadataNumber(metadata, "suggestedValue")
      ?? metadataNumber(metadata, "suggestedDose")
      ?? metadataNumber(metadata, "suggestedVolume"),
    suggestedVolume: metadataNumber(mode, "suggestedVolume")
      ?? metadataNumber(metadata, "suggestedVolume"),
    suggestedVolumeByRoute: volumeByRoute(metadata),
    suggestedRate: metadataNumber(mode, "suggestedRate")
      ?? metadataNumber(metadata, "suggestedRate"),
  }
}
