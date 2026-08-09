import { useEffect, useMemo, useState } from "react"
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import type { ScenarioGroup } from "@lospor/core"
import { usePreferences } from "@/lib/preferences-context"
import { displayClinicalCode } from "@/lib/clinical-display"
import {
  applicablePediatricInfusionProfiles,
  resolvePediatricInfusionProfileSurface,
  type PediatricInfusionProfileRule,
  type PediatricInfusionSelectionResolution,
} from "@lospor/core/clinical-rules"
import type { PediatricAgeInput } from "@lospor/core/pediatric"
import type { DrugFormulation } from "@/lib/intraop-log-event"
import type { InfusionRuleSelection } from "@/lib/use-infusion-entry"

type InfusionOption = { name: string; unit: string; color: string }
type Range = { min: number; max: number; step: number }
type InfProfile = Range & {
  mode?: string
  quickValues: number[]
  unit: string
  concentrationOptions?: string[]
  suggestedRate?: number
  suggestedConcentration?: string
}
type ActiveInfProfile = InfProfile & {
  route?: string
  routes?: string[]
  concentrationUnit?: string
  formulationOptions?: DrugFormulation[]
  formulation?: DrugFormulation
  manualEntryOnly?: boolean
  advisory?: string | null
  rule?: InfusionRuleSelection
  disposition?: PediatricInfusionSelectionResolution["disposition"]
}

function Pill({
  label, sublabel, color, selected, onPress, wide,
}: {
  label: string
  sublabel?: string
  color: string
  selected?: boolean
  onPress: () => void
  wide?: boolean
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        width: wide ? "100%" : "47.5%",
        minHeight: 58,
        justifyContent: "center",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: selected ? color : color + "1a",
        borderWidth: 1,
        borderColor: selected ? color : color + "66",
      }}
    >
      <Text style={{ color: selected ? "#fff" : color, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>
        {label}
      </Text>
      {sublabel ? (
        <Text style={{ color: selected ? "#e2e8f0" : "#94a3b8", fontSize: 10, marginTop: 2 }} numberOfLines={1}>
          {sublabel}
        </Text>
      ) : null}
    </TouchableOpacity>
  )
}

export function InfusionSheet({
  visible, onClose, infDrugs, favouriteNames, scenarios, ratePresets, infDrug, setInfDrug, infRate, setInfRate, onConfirm,
  routes = {}, infRoute, setInfRoute, laConcentrations = {}, infConcentration, setInfConcentration,
  infCustomConcentration, setInfCustomConcentration, infFormulation, setInfFormulation,
  infRule, setInfRule,
  ranges = {}, suggestedRates = {}, baseProfiles = {}, routeProfiles = {}, pediatricMode = false,
  pediatricInfusionProfiles = [], patientAge = null, patientWeightKg,
}: {
  visible: boolean
  onClose: () => void
  infDrugs: InfusionOption[]
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
  setInfRoute?: (r: string) => void
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
}) {
  const { tc, language } = usePreferences()
  const infusionLabel = (name: string) => displayClinicalCode("option:INTRAOP_INFUSION", name, language, { label: name })
  const scenarioLabel = (group: ScenarioGroup) => displayClinicalCode("scenarioGroup", group.key, language, { label: group.label })
  const [mode, setMode] = useState<"home" | "favourites" | "scenario" | "browse">("home")
  const [scenario, setScenario] = useState<ScenarioGroup | null>(null)
  const [query, setQuery] = useState("")

  // Reset to the home menu each time the sheet opens (see DrugSheet).
  useEffect(() => {
    if (visible) { setMode("home"); setScenario(null); setQuery("") }
  }, [visible])

  function pediatricSurfaceFor(name: string, route?: string): PediatricInfusionSelectionResolution | undefined {
    if (!pediatricMode) return undefined
    const matches = applicablePediatricInfusionProfiles({
      itemKey: name,
      age: patientAge,
      weightKg: patientWeightKg,
      profiles: pediatricInfusionProfiles,
    })
    if (matches.length !== 1) return undefined
    return resolvePediatricInfusionProfileSurface({ rule: matches[0], route })
  }

  const visibleInfDrugs = pediatricMode
    ? infDrugs.filter(drug => pediatricSurfaceFor(drug.name)?.disposition !== "HIDDEN")
    : infDrugs
  const byName = useMemo(() => new Map(visibleInfDrugs.map(drug => [drug.name, drug])), [visibleInfDrugs])

  function profileFor(name: string, route?: string): ActiveInfProfile | undefined {
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
        route: surface.route,
        routes: surface.routes,
        manualEntryOnly: surface.manualEntryOnly,
        advisory: surface.advisory,
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

  // Active dose surface (unit / range / quick values / concentration) for the
  // currently picked drug + route — falls back to the flat ranges/concentration
  // maps for infusions that have no per-route profile.
  const initialActiveProfile = infDrug ? profileFor(infDrug.name, infRoute) : undefined
  const activeRoute = infDrug ? (infRoute ?? initialActiveProfile?.route ?? routes[infDrug.name]?.[0]) : undefined
  const activeProfile = infDrug ? profileFor(infDrug.name, activeRoute) : undefined
  const activeUnit = activeProfile?.unit ?? infDrug?.unit ?? "mg/hr"
  const activeQuickValues = activeProfile?.quickValues?.length
      ? activeProfile.quickValues
      : (infDrug ? ratePresets[infDrug.name]?.map(Number) : undefined)
  const activeConcentrations = activeProfile
      ? (activeProfile.mode?.includes("concentration") ? activeProfile.concentrationOptions : undefined)
      : (infDrug ? laConcentrations[infDrug.name] : undefined)
  const activeRange = activeProfile
    ? { min: activeProfile.min, max: activeProfile.max, step: activeProfile.step }
    : (infDrug ? ranges[infDrug.name] ?? { min: 0, max: 100, step: 1 } : { min: 0, max: 100, step: 1 })

  function selectInfusion(drug: InfusionOption) {
    const initialProfile = profileFor(drug.name)
    const firstRoute = initialProfile?.route ?? initialProfile?.routes?.[0] ?? routes[drug.name]?.[0]
    const profile = profileFor(drug.name, firstRoute) ?? initialProfile
    if (pediatricMode && !profile) return
    setInfDrug({ ...drug, unit: profile?.unit ?? drug.unit })
    setInfRoute?.(firstRoute ?? "")
    setInfRate(autofillRate(drug.name, profile))
    setInfConcentration?.(profile?.suggestedConcentration)
    setInfCustomConcentration?.(undefined)
    setInfFormulation?.(profile?.formulation)
    setInfRule?.(profile?.rule)
  }

  function changeRoute(route: string) {
    if (!infDrug) return
    const profile = profileFor(infDrug.name, route)
    setInfRoute?.(route)
    if (profile?.unit) setInfDrug({ ...infDrug, unit: profile.unit })
    setInfRate(autofillRate(infDrug.name, profile))
    setInfConcentration?.(profile?.suggestedConcentration)
    setInfCustomConcentration?.(undefined)
    setInfFormulation?.(profile?.formulation)
    setInfRule?.(profile?.rule)
  }

  function selectCanonical(canonical: string) {
    const found = byName.get(canonical)
    if (found) selectInfusion(found)
  }

  const filtered = query.trim()
    ? visibleInfDrugs.filter(drug => [drug.name, infusionLabel(drug.name)].some(value => value.toLowerCase().includes(query.trim().toLowerCase())))
    : visibleInfDrugs
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
          <TouchableOpacity onPress={() => setInfDrug(null)} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <DoseSelector
            color={infDrug.color}
            quickValues={activeQuickValues}
            value={infRate} onValueChange={setInfRate}
            {...activeRange}
            valuePlaceholder={tc("dsOrTypeCustom")}
            manualEntryOnly={activeProfile?.manualEntryOnly}
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
        </ScrollView>
      ) : mode === "scenario" && scenario ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => { setScenario(null); setMode("home") }} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {scenarioItems.map(({ entry, drug }) => (
              <Pill key={entry.canonical} label={infusionLabel(entry.canonical)} sublabel={drug.unit} color={scenario.color} onPress={() => selectCanonical(entry.canonical)} />
            ))}
          </View>
        </ScrollView>
      ) : mode === "favourites" ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => setMode("home")} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          {favouriteItems.length === 0 ? (
            <Text style={{ color:"#64748b", fontSize:13, lineHeight:18 }}>{tc("dsChooseFavourites")}</Text>
          ) : (
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
              {favouriteItems.map(drug => (
                <Pill key={drug.name} label={infusionLabel(drug.name)} sublabel={drug.unit} color={drug.color} onPress={() => selectInfusion(drug)} />
              ))}
            </View>
          )}
        </ScrollView>
      ) : mode === "browse" ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => { setQuery(""); setMode("home") }} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tc("dsSearchInfusions")}
            placeholderTextColor="#475569"
            style={{ backgroundColor:"#111820", color:"#e2e8f0", borderRadius:10, paddingHorizontal:12, paddingVertical:10,
              borderWidth:1, borderColor:"#1e2d40", marginBottom:14 }}
          />
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {filtered.map(drug => (
              <Pill key={drug.name} label={infusionLabel(drug.name)} sublabel={drug.unit} color={drug.color} onPress={() => selectInfusion(drug)} />
            ))}
          </View>
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10, marginBottom:16 }}>
            <Pill label={tc("dsFavourites")} sublabel={`${favouriteItems.length || 0} ${tc("dsSelected")}`} color="#38bdf8" onPress={() => setMode("favourites")} wide />
          </View>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {scenarios.map(group => (
              <Pill key={group.key} label={scenarioLabel(group)} sublabel={group.items.slice(0, 2).map(i => infusionLabel(i.canonical)).join(", ")} color={group.color}
                onPress={() => { setScenario(group); setMode("scenario") }} />
            ))}
          </View>
          <View style={{ marginTop:18 }}>
            <Pill label={tc("dsBrowseAllInfusions")} sublabel={tc("dsSearchCanonicalList")} color="#64748b" onPress={() => setMode("browse")} wide />
          </View>
        </ScrollView>
      )}
    </Sheet>
  )
}
