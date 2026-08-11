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
  type JsonObject,
} from "@lospor/core/option-contracts"
import { normalizeAdministrationRoute } from "@lospor/core/clinical-rule-vocabulary"
import { resolveOptionDoseSurface } from "@lospor/core/option-surface"
import {
  type DrugFormulation,
} from "@/lib/intraop-log-event"

export type DrugDoseSurface = RouteProfile & {
  defaultConcentration?: string
  suggestedVolume?: number
  suggestedVolumeByRoute?: Record<string, number>
  formulationOptions?: DrugFormulation[]
  defaultFormulation?: DrugFormulation
}

/**
 * Drug entry needs the option's UI defaults — its strengths, formulations and
 * pre-filled volume — on top of the calculation fields the shared RouteProfile
 * mapper exposes.
 *
 * Reading those out of the metadata is the same job the web chart does, and the
 * two used to disagree about which field wins when a page states more than one.
 * @lospor/core/option-surface decides that once; this only reshapes the result
 * into what the sheets expect.
 */
function enrichSurface(
  surface: RouteProfile,
  metadata: JsonObject | null | undefined,
  route?: string,
): DrugDoseSurface {
  const shared = resolveOptionDoseSurface({ metadata, route })
  return {
    ...surface,
    defaultConcentration: shared?.concentration,
    suggestedVolume: shared?.suggestedVolume,
    suggestedVolumeByRoute: shared?.suggestedVolumeByRoute,
    formulationOptions: shared?.formulationOptions.length
      ? shared.formulationOptions as DrugFormulation[]
      : undefined,
    defaultFormulation: shared?.formulation as DrugFormulation | undefined,
  }
}

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
    const canonicalSurfaces = Object.entries(surfaces).flatMap(([route, surface]) => {
      const canonicalRoute = normalizeAdministrationRoute(route) ?? route
      // Ask for this route by name: the shared reader applies the route's own
      // entry over the drug's, which is what reading the raw blob did by hand.
      return [[canonicalRoute, enrichSurface(surface, option.metadata, canonicalRoute)]]
    })
    return canonicalSurfaces.length
      ? [[option.label, Object.fromEntries(canonicalSurfaces)]]
      : []
  }))
}

