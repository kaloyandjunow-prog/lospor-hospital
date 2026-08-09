export {
  baseProfilesMap,
  canStartDrugAsInfusion,
  codesMap,
  concentrationsMap,
  defaultConcentrationMap,
  defaultedRangeMap,
  doseCalcMap,
  groupClinicalEvents,
  groupDrugCategories,
  quickNumberMap,
  quickStringMap,
  routeProfilesMap,
  routesMap,
  strictRangeMap,
  suggestedRateMap,
  type ClinicalEventCategory,
  type DoseCalcEntry,
  type DoseCalcRule,
  type DrugCategory,
  type NumberRange as Range,
  type RouteProfile,
} from "@lospor/core/option-library"

import {
  baseProfilesMap,
  routeProfilesMap,
  type LibraryOption,
  type RouteProfile,
} from "@lospor/core/option-library"
import {
  metadataNumber,
  metadataObject,
  metadataString,
  metadataStrings,
  type JsonObject,
} from "@lospor/core/option-contracts"
import { normalizeAdministrationRoute } from "@lospor/core/clinical-rule-vocabulary"
import {
  normalizeDrugFormulation,
  type DrugFormulation,
} from "@/lib/intraop-log-event"

export type DrugDoseSurface = RouteProfile & {
  defaultConcentration?: string
  suggestedVolume?: number
  suggestedVolumeByRoute?: Record<string, number>
  formulationOptions?: DrugFormulation[]
  defaultFormulation?: DrugFormulation
}

function formulationOptions(metadata: JsonObject | null | undefined): DrugFormulation[] {
  return metadataStrings(metadata, "formulationOptions")
    .map(normalizeDrugFormulation)
    .filter((value): value is DrugFormulation => value !== undefined)
}

function formulationDefault(metadata: JsonObject | null | undefined): DrugFormulation | undefined {
  return normalizeDrugFormulation(
    metadataString(metadata, "suggestedFormulation")
      ?? metadataString(metadata, "defaultFormulation"),
  )
}

function volumeByRoute(metadata: JsonObject | null | undefined): Record<string, number> | undefined {
  const raw = metadataObject(metadata, "suggestedVolumeByRoute")
  if (!raw) return undefined
  const entries = Object.entries(raw).flatMap(([route, value]) => {
    const canonicalRoute = normalizeAdministrationRoute(route) ?? route
    return canonicalRoute && typeof value === "number" && Number.isFinite(value)
      ? [[canonicalRoute, value] as const]
      : []
  })
  return entries.length ? Object.fromEntries(entries) : undefined
}

function enrichSurface(
  surface: RouteProfile,
  metadata: JsonObject | null | undefined,
): DrugDoseSurface {
  const formulations = formulationOptions(metadata)
  return {
    ...surface,
    defaultConcentration: metadataString(metadata, "defaultConcentration"),
    suggestedVolume: metadataNumber(metadata, "suggestedVolume"),
    suggestedVolumeByRoute: volumeByRoute(metadata),
    formulationOptions: formulations.length ? formulations : undefined,
    defaultFormulation: formulationDefault(metadata),
  }
}

// The shared RouteProfile mapper intentionally exposes only calculation
// fields. Drug entry also needs its explicit UI defaults, so enrich those
// profiles locally without changing the web package or mutating catalog data.
export function drugBaseProfilesMap(options: LibraryOption[]): Record<string, DrugDoseSurface> {
  const mapped = baseProfilesMap(options)
  return Object.fromEntries(options.flatMap(option => {
    const surface = mapped[option.label]
    return surface ? [[option.label, enrichSurface(surface, option.metadata)]] : []
  }))
}

export function drugRouteProfilesMap(
  options: LibraryOption[],
): Record<string, Record<string, DrugDoseSurface>> {
  const mapped = routeProfilesMap(options)
  return Object.fromEntries(options.flatMap(option => {
    const surfaces = mapped[option.label]
    if (!surfaces) return []
    const rawModes = metadataObject(option.metadata, "routeModes")
    const canonicalSurfaces = Object.entries(surfaces).flatMap(([route, surface]) => {
      const canonicalRoute = normalizeAdministrationRoute(route) ?? route
      const raw = rawModes && metadataObject(rawModes, route)
      return [[canonicalRoute, enrichSurface(surface, raw)]]
    })
    return canonicalSurfaces.length
      ? [[option.label, Object.fromEntries(canonicalSurfaces)]]
      : []
  }))
}

