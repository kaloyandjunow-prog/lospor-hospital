import { useEffect, useMemo, useState } from "react"
import { ScrollView, Text, TouchableOpacity } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import type { ScenarioGroup } from "@lospor/core"
import { usePreferences } from "@/lib/preferences-context"
import { displayClinicalCode } from "@/lib/clinical-display"
import {
  resolvePediatricInfusionProfileSurface,
  type PediatricInfusionProfileRule,
  type PediatricInfusionSelectionResolution,
} from "@lospor/core/clinical-rules"
import type { PediatricAgeInput } from "@lospor/core/pediatric"
import type { DrugFormulation } from "@/lib/intraop-log-event"
import {
  resolvePediatricInfusionAvailability,
  type PediatricInfusionAvailability,
} from "@/lib/pediatric-infusion-routes"
import type { InfusionRuleSelection } from "@/lib/use-infusion-entry"
import type { SearchOnlyMedicationOption } from "@/lib/hidden-clinical-options"
import { InfusionPickerMenu, type InfusionPickerMode } from "@/components/intraop/InfusionPickerMenu"
import { activeInfusionSurface, filterInfusionPickerResults, type ActiveInfProfile, type InfProfile, type InfusionOption, type Range } from "@/components/intraop/infusion-sheet-helpers"

export function InfusionSheet({
  visible, onClose, infDrugs, searchOnlyInfusions = [], favouriteNames, scenarios, ratePresets, infDrug, setInfDrug, infRate, setInfRate, onConfirm,
  routes = {}, infRoute, setInfRoute, laConcentrations = {}, infConcentration, setInfConcentration,
  infCustomConcentration, setInfCustomConcentration, infFormulation, setInfFormulation,
  infRule, setInfRule,
  ranges = {}, suggestedRates = {}, baseProfiles = {}, routeProfiles = {}, pediatricMode = false,
  pediatricInfusionProfiles = [], patientAge = null, patientWeightKg,
  prospectiveGuidanceEnabled = true,
}: {
  visible: boolean
  onClose: () => void
  infDrugs: InfusionOption[]
  searchOnlyInfusions?: readonly SearchOnlyMedicationOption[]
  favouriteNames: string[]
  scenarios: ScenarioGroup[]
  ratePresets: Record<string, string[]>
  infDrug: InfusionOption | null
  setInfDrug: (d: InfusionOption | null) => void
  infRate: string
  setInfRate: (v: string) => void
  onConfirm: () => void
  routes?: Record<string, string[]>
  infRoute?: string
  setInfRoute?: (r: string | undefined) => void
  laConcentrations?: Record<string, string[]>
  infConcentration?: string
  setInfConcentration?: (c: string | undefined) => void
  infCustomConcentration?: string
  setInfCustomConcentration?: (c: string | undefined) => void
  infFormulation?: DrugFormulation
  setInfFormulation?: (value: DrugFormulation | undefined) => void
  infRule?: InfusionRuleSelection
  setInfRule?: (value: InfusionRuleSelection | undefined) => void
  ranges?: Record<string, Range>
  suggestedRates?: Record<string, string>
  baseProfiles?: Record<string, InfProfile>
  routeProfiles?: Record<string, Record<string, InfProfile>>
  pediatricMode?: boolean
  pediatricInfusionProfiles?: readonly PediatricInfusionProfileRule[]
  patientAge?: PediatricAgeInput | null
  patientWeightKg?: number | null
  prospectiveGuidanceEnabled?: boolean
}) {
  const { tc, language } = usePreferences()
  const infusionLabel = (name: string) => displayClinicalCode("option:INTRAOP_INFUSION", name, language, { label: name })
  const scenarioLabel = (group: ScenarioGroup) => displayClinicalCode("scenarioGroup", group.key, language, { label: group.label })
  const [mode, setMode] = useState<InfusionPickerMode>("home")
  const [scenario, setScenario] = useState<ScenarioGroup | null>(null)
  const [query, setQuery] = useState("")
  const [searchOnlySelection, setSearchOnlySelection] = useState<SearchOnlyMedicationOption | null>(null)

  // Reset to the home menu each time the sheet opens (see DrugSheet).
  useEffect(() => {
    if (visible) {
      setMode("home")
      setScenario(null)
      setQuery("")
      setSearchOnlySelection(null)
    }
  }, [visible])

  const availabilityByName = useMemo(() => new Map(
    pediatricMode
      ? infDrugs.map(drug => [drug.name, resolvePediatricInfusionAvailability({
          itemKey: drug.name,
          age: patientAge,
          weightKg: patientWeightKg,
          profiles: pediatricInfusionProfiles,
        })] as const)
      : [],
  ), [pediatricMode, infDrugs, patientAge, patientWeightKg, pediatricInfusionProfiles])

  function availabilityFor(name: string): PediatricInfusionAvailability | undefined {
    if (!pediatricMode) return undefined
    return availabilityByName.get(name) ?? resolvePediatricInfusionAvailability({
      itemKey: name,
      age: patientAge,
      weightKg: patientWeightKg,
      profiles: pediatricInfusionProfiles,
    })
  }

  function pediatricSurfaceFor(name: string, route?: string): PediatricInfusionSelectionResolution | undefined {
    const rule = availabilityFor(name)?.rule
    if (!rule) return undefined
    return resolvePediatricInfusionProfileSurface({ rule, route })
  }

  // Offered when any route survives — a withdrawn default is not a withdrawn
  // drug. A conflict keeps its row too: hiding it is indistinguishable from the
  // ruleset not covering this child, and the sheet has something to say.
  const searchOnlyNames = useMemo(
    () => new Set(searchOnlyInfusions.map(option => option.name)),
    [searchOnlyInfusions],
  )
  const visibleInfDrugs = useMemo(() => {
    const routine = infDrugs.filter(drug => !searchOnlyNames.has(drug.name))
    return pediatricMode && pediatricInfusionProfiles.length > 0
      ? routine.filter(drug => {
        const available = availabilityByName.get(drug.name)
        return !!available && (available.conflict || available.routes.length > 0)
      })
      : routine
  }, [availabilityByName, infDrugs, pediatricInfusionProfiles.length, pediatricMode, searchOnlyNames])
  const byName = useMemo(() => new Map(visibleInfDrugs.map(drug => [drug.name, drug])), [visibleInfDrugs])
  const routineScenarios = useMemo(() => scenarios
    .map(group => ({
      ...group,
      items: group.items.filter(item => byName.has(item.canonical)),
    }))
    .filter(group => group.items.length > 0), [byName, scenarios])

  function profileFor(name: string, route?: string): ActiveInfProfile | undefined {
    if (!prospectiveGuidanceEnabled || searchOnlySelection?.name === name) return undefined
    if (pediatricMode) {
      const surface = pediatricSurfaceFor(name, route)
      if (!surface || surface.disposition === "HIDDEN") return undefined
      return {
        mode: surface.mode,
        min: surface.min,
        max: surface.max,
        step: surface.step,
        quickValues: surface.quickValues,
        unit: surface.unit,
        suggestedRate: surface.suggestedRate,
        suggestedConcentration: surface.concentration || undefined,
        concentrationOptions: surface.concentrationOptions,
        concentrationUnit: surface.concentrationUnit,
        formulationOptions: surface.formulationOptions,
        formulation: surface.formulation,
        advisory: surface.advisory,
        route: surface.route,
        routes: availabilityFor(name)?.routes ?? surface.routes,
        manualEntryOnly: surface.manualEntryOnly,
        disposition: surface.disposition,
        rule: { key: surface.ruleKey, version: surface.ruleVersion, sourceIds: surface.sourceIds },
      }
    }
    return (route ? routeProfiles[name]?.[route] : undefined) ?? baseProfiles[name]
  }

  // The route's autofill rate: per-route suggestedRate, else the flat
  // suggested rate, else the first quick value.
  function autofillRate(name: string, profile?: ActiveInfProfile): string {
    if (profile?.suggestedRate != null) return String(profile.suggestedRate)
    if (pediatricMode) return ""
    const suggested = suggestedRates[name]
    if (suggested != null) return suggested
    const preset = profile?.quickValues?.[0] ?? ratePresets[name]?.[0]
    return preset != null ? String(preset) : ""
  }

  // Which unit, range, quick values and concentrations this selection may
  // offer. Decided in infusion-sheet-helpers so the sheet only renders it.
  const {
    pediatricConflict,
    activeRoute,
    activeProfile,
    activeUnit,
    activeQuickValues,
    activeConcentrations,
    activeRange,
  } = activeInfusionSurface({
    drug: infDrug,
    route: infRoute,
    searchOnlySelection,
    prospectiveGuidanceEnabled,
    profileFor,
    availabilityFor,
    routes,
    ratePresets,
    laConcentrations,
    ranges,
  })

  function selectInfusion(drug: InfusionOption) {
    setSearchOnlySelection(null)
    const available = availabilityFor(drug.name)
    if (!prospectiveGuidanceEnabled) {
      setInfDrug(drug)
      setInfRoute?.(routes[drug.name]?.[0] ?? "")
      setInfRate("")
      setInfConcentration?.(undefined)
      setInfCustomConcentration?.(undefined)
      setInfFormulation?.(undefined)
      setInfRule?.(undefined)
      return
    }
    if (available?.conflict) {
      // Nothing may be autofilled and no rule may be credited, but the drug is
      // still picked so the sheet can say why rather than ignore the tap.
      setInfDrug(drug)
      setInfRoute?.("")
      setInfRate("")
      setInfConcentration?.(undefined)
      setInfCustomConcentration?.(undefined)
      setInfFormulation?.(undefined)
      setInfRule?.(undefined)
      return
    }
    const firstRoute = available
      ? available.defaultRoute
      : profileFor(drug.name)?.route ?? routes[drug.name]?.[0]
    const profile = profileFor(drug.name, firstRoute)
    if (pediatricMode && !profile) return
    setInfDrug({ ...drug, unit: profile?.unit ?? drug.unit })
    setInfRoute?.(firstRoute ?? "")
    setInfRate(autofillRate(drug.name, profile))
    setInfConcentration?.(profile?.suggestedConcentration)
    setInfCustomConcentration?.(undefined)
    setInfFormulation?.(profile?.formulation)
    setInfRule?.(profile?.rule)
  }

  function selectSearchOnly(option: SearchOnlyMedicationOption) {
    setSearchOnlySelection(option)
    setInfDrug({ name: option.name, unit: option.unit, color: option.color })
    setInfRoute?.(option.routes[0] ?? "IV")
    setInfRate("")
    setInfConcentration?.(undefined)
    setInfCustomConcentration?.(undefined)
    setInfFormulation?.(undefined)
    setInfRule?.({ ...option.rule, sourceIds: [...option.rule.sourceIds] })
  }

  function changeRoute(route: string) {
    if (!infDrug) return
    if (searchOnlySelection) {
      setInfRoute?.(route)
      setInfConcentration?.(undefined)
      setInfCustomConcentration?.(undefined)
      setInfFormulation?.(undefined)
      return
    }
    if (!prospectiveGuidanceEnabled) {
      setInfRoute?.(route)
      setInfRate("")
      setInfConcentration?.(undefined)
      setInfCustomConcentration?.(undefined)
      setInfFormulation?.(undefined)
      setInfRule?.(undefined)
      return
    }
    const profile = profileFor(infDrug.name, route)
    setInfRoute?.(route)
    if (profile?.unit) setInfDrug({ ...infDrug, unit: profile.unit })
    setInfRate(autofillRate(infDrug.name, profile))
    setInfConcentration?.(profile?.suggestedConcentration)
    setInfCustomConcentration?.(undefined)
    setInfFormulation?.(profile?.formulation)
    setInfRule?.(profile?.rule)
  }

  const filtered = filterInfusionPickerResults({
    query,
    visibleInfusions: visibleInfDrugs,
    searchOnlyInfusions,
    displayName: infusionLabel,
  })
  const scenarioItems = scenario?.items
    .map(entry => ({ entry, drug: byName.get(entry.canonical) }))
    .filter((row): row is { entry: { label: string; canonical: string }; drug: InfusionOption } => !!row.drug) ?? []
  const favouriteItems = favouriteNames
    .map(name => byName.get(name))
    .filter((drug): drug is InfusionOption => !!drug)

  return (
    <Sheet visible={visible} onClose={onClose} title={infDrug ? infusionLabel(infDrug.name) : mode === "browse" ? tc("dsBrowseInfusions") : mode === "favourites" ? tc("dsFavouriteInfusions") : scenario ? scenarioLabel(scenario) : tc("dsStartInfusion")} full>
      {infDrug ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => {
            setInfDrug(null)
            setInfRate("")
            setInfRoute?.(undefined)
            setInfConcentration?.(undefined)
            setInfCustomConcentration?.(undefined)
            setInfFormulation?.(undefined)
            setInfRule?.(undefined)
            setSearchOnlySelection(null)
          }} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          {searchOnlySelection ? (
            <>
              <Text
                testID="infusion-search-only-manual-notice"
                accessibilityRole="alert"
                style={{ color:"#fbbf24", fontSize:12, lineHeight:17, marginBottom:12 }}
              >
                {tc("dsSearchOnlyManualNotice")}
              </Text>
              <DoseSelector
                color={infDrug.color}
                value={infRate}
                onValueChange={setInfRate}
                {...activeRange}
                valuePlaceholder={tc("dsOrTypeCustom")}
                manualEntryOnly
                unitSuffix={activeUnit}
                routes={searchOnlySelection.routes}
                route={activeRoute}
                onRouteChange={changeRoute}
                confirmLabel={`${tc("dsStart")} ${infusionLabel(infDrug.name)} ${infRate} ${activeUnit}`}
                onConfirm={onConfirm}
                confirmDisabled={!infRate || Number(infRate) <= 0}
              />
            </>
          ) : pediatricConflict ? (
            <Text
              testID="infusion-profile-conflict"
              accessibilityRole="alert"
              style={{ color:"#fca5a5", fontSize:12, lineHeight:17 }}
            >
              {tc("pediatricInfusionConflict")}
            </Text>
          ) : (
          <DoseSelector
            color={infDrug.color}
            quickValues={activeQuickValues}
            value={infRate} onValueChange={setInfRate}
            {...activeRange}
            valuePlaceholder={tc("dsOrTypeCustom")}
            manualEntryOnly={!prospectiveGuidanceEnabled || activeProfile?.manualEntryOnly}
            unitSuffix={activeUnit}
            routes={activeProfile?.routes ?? routes[infDrug.name]} route={activeRoute} onRouteChange={changeRoute}
            concentrationOptions={activeConcentrations}
            concentrationUnit={activeProfile?.concentrationUnit}
            concentration={infConcentration} onConcentrationChange={setInfConcentration}
            customConcentration={infCustomConcentration}
            onCustomConcentrationChange={value => {
              setInfCustomConcentration?.(value)
              setInfConcentration?.(value?.trim()
                ? `${value.trim()}${activeProfile?.concentrationUnit === "PERCENT" ? "%" : ""}`
                : undefined)
            }}
            formulationOptions={activeProfile?.formulationOptions}
            formulation={infFormulation}
            onFormulationChange={setInfFormulation}
            extraHint={activeProfile?.advisory ?? undefined}
            confirmLabel={`${tc("dsStart")} ${infusionLabel(infDrug.name)} ${infRate} ${activeUnit}`}
            onConfirm={onConfirm}
            confirmDisabled={
              !infRate
              || Number(infRate) <= 0
              || (!!activeProfile?.concentrationUnit && !infConcentration)
              || (!!activeProfile?.formulationOptions?.length && !infFormulation)
              || (pediatricMode && !infRule)
            }
          />
          )}
        </ScrollView>
      ) : (
        <InfusionPickerMenu
          mode={mode}
          scenario={scenario}
          query={query}
          filtered={filtered}
          scenarioItems={scenarioItems}
          favouriteItems={favouriteItems}
          routineScenarios={routineScenarios}
          infusionLabel={infusionLabel}
          scenarioLabel={scenarioLabel}
          tc={tc}
          onBackHome={() => { setScenario(null); setQuery(""); setMode("home") }}
          onQueryChange={setQuery}
          onSelectRoutine={selectInfusion}
          onSelectSearchOnly={selectSearchOnly}
          onOpenFavourites={() => setMode("favourites")}
          onOpenScenario={group => { setScenario(group); setMode("scenario") }}
          onOpenBrowse={() => setMode("browse")}
        />
      )}
    </Sheet>
  )
}
