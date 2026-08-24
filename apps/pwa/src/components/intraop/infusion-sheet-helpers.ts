import type { PediatricInfusionSelectionResolution } from "@lospor/core/clinical-rules"
import type { SearchOnlyMedicationOption } from "@/lib/hidden-clinical-options"
import type { DrugFormulation } from "@/lib/intraop-log-event"
import type { InfusionRuleSelection } from "@/lib/use-infusion-entry"
import type { InfusionPickerOption, InfusionPickerResult } from "@/components/intraop/InfusionPickerMenu"

export type InfusionOption = InfusionPickerOption
export type Range = { min: number; max: number; step: number }
export type InfProfile = Range & {
  mode?: string
  quickValues: number[]
  unit: string
  concentrationOptions?: string[]
  suggestedRate?: number
  suggestedConcentration?: string
  advisory?: string | null
}
export type ActiveInfProfile = InfProfile & {
  route?: string
  routes?: string[]
  concentrationUnit?: string
  formulationOptions?: DrugFormulation[]
  formulation?: DrugFormulation
  manualEntryOnly?: boolean
  rule?: InfusionRuleSelection
  disposition?: PediatricInfusionSelectionResolution["disposition"]
}

export function filterInfusionPickerResults({
  query,
  visibleInfusions,
  searchOnlyInfusions,
  displayName,
}: {
  query: string
  visibleInfusions: readonly InfusionOption[]
  searchOnlyInfusions: readonly SearchOnlyMedicationOption[]
  displayName: (name: string) => string
}): InfusionPickerResult[] {
  const normalizedQuery = query.trim().toLowerCase()
  return normalizedQuery
    ? [
        ...visibleInfusions
          .filter(drug => [drug.name, displayName(drug.name)]
            .some(value => value.toLowerCase().includes(normalizedQuery)))
          .map(drug => ({ ...drug, searchOnly: null as SearchOnlyMedicationOption | null })),
        ...searchOnlyInfusions
          .filter(drug => [drug.name, displayName(drug.name)]
            .some(value => value.toLowerCase().includes(normalizedQuery)))
          .map(drug => ({ ...drug, searchOnly: drug })),
      ]
    : visibleInfusions.map(drug => ({ ...drug, searchOnly: null as SearchOnlyMedicationOption | null }))
}

/**
 * The dose surface that applies to the drug and route currently picked.
 *
 * Extracted from InfusionSheet so the sheet renders and this decides. It is the
 * same question `dose-surfaces.ts` answers on the web client: given a selection,
 * which unit, range, quick values and concentrations may be offered.
 *
 * Every branch collapses to a manual surface when prospective guidance is off or
 * the drug was reached through search rather than a governed profile: no quick
 * values, no concentrations, and a range wide enough to accept whatever the
 * clinician actually gave. Suppressing the suggestion must never suppress the
 * record.
 */
export function activeInfusionSurface(input: {
  drug: InfusionOption | null | undefined
  route: string | undefined
  searchOnlySelection: SearchOnlyMedicationOption | null
  prospectiveGuidanceEnabled: boolean
  profileFor: (name: string, route?: string) => ActiveInfProfile | undefined
  availabilityFor: (name: string) => { conflict?: boolean } | undefined
  routes: Record<string, string[]>
  ratePresets: Record<string, Array<string | number>>
  laConcentrations: Record<string, string[]>
  ranges: Record<string, Range>
}): {
  pediatricConflict: boolean
  activeRoute: string | undefined
  activeProfile: ActiveInfProfile | undefined
  activeUnit: string
  activeQuickValues: number[] | undefined
  activeConcentrations: string[] | undefined
  activeRange: Range
} {
  const { drug, route, searchOnlySelection, prospectiveGuidanceEnabled } = input
  const governed = prospectiveGuidanceEnabled && !searchOnlySelection

  const pediatricConflict = governed && drug
    ? input.availabilityFor(drug.name)?.conflict ?? false
    : false
  const initialActiveProfile = drug ? input.profileFor(drug.name, route) : undefined
  const activeRoute = drug
    ? (route ?? searchOnlySelection?.routes[0] ?? initialActiveProfile?.route ?? input.routes[drug.name]?.[0])
    : undefined
  const activeProfile = drug ? input.profileFor(drug.name, activeRoute) : undefined
  const activeUnit = searchOnlySelection?.unit ?? activeProfile?.unit ?? drug?.unit ?? "mg/hr"

  const activeQuickValues = !governed
    ? undefined
    : activeProfile?.quickValues?.length
      ? activeProfile.quickValues
      : (drug ? input.ratePresets[drug.name]?.map(Number) : undefined)

  const activeConcentrations = !governed
    ? undefined
    : activeProfile
      ? (activeProfile.mode?.includes("concentration") ? activeProfile.concentrationOptions : undefined)
      : (drug ? input.laConcentrations[drug.name] : undefined)

  const activeRange = !governed
    ? { min: 0, max: 100_000, step: 0.1 }
    : activeProfile
      ? { min: activeProfile.min, max: activeProfile.max, step: activeProfile.step }
      : (drug ? input.ranges[drug.name] ?? { min: 0, max: 100, step: 1 } : { min: 0, max: 100, step: 1 })

  return {
    pediatricConflict,
    activeRoute,
    activeProfile,
    activeUnit,
    activeQuickValues,
    activeConcentrations,
    activeRange,
  }
}
