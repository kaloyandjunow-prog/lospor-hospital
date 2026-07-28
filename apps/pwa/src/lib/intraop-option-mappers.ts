import {
  mapPositionOptions as mapCorePositionOptions,
  mapPremedicationCategories as mapCorePremedicationCategories,
  type PremedicationCategory as CorePremedicationCategory,
} from "@lospor/core/option-library"
import { MOBILE_POSITION_COLOR } from "./intraop-constants"
import type { PremDrug } from "./intraop-types"
import type { LibraryOption } from "./use-option-library"

export {
  mapAirwayOptions,
  mapMonitoringOptions,
  type AirwayOption,
  type MonitoringOption,
  type PositionOption,
} from "@lospor/core/option-library"

export type PremedicationCategory = { category: string; drugs: PremDrug[] }

export function mapPositionOptions(rows: LibraryOption[]) {
  return mapCorePositionOptions(rows, MOBILE_POSITION_COLOR)
}

export function mapPremedicationCategories(rows: LibraryOption[]): PremedicationCategory[] {
  return (mapCorePremedicationCategories(rows) as CorePremedicationCategory[]) as PremedicationCategory[]
}

