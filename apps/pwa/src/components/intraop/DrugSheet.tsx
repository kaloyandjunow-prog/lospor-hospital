import { useEffect, useMemo, useState } from "react"
import { Text, TextInput, TouchableOpacity, View } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import { FeedbackPressable } from "@/components/intraop/FeedbackPressable"
import { usePreferences } from "@/lib/preferences-context"
import { displayClinicalCode } from "@/lib/clinical-display"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import type { ScenarioGroup } from "@lospor/core"
import { calcSuggestedDose as calcDose } from "@/lib/dose-calc"
import {
  canonicalDoseUnit,
  normalizeAdministrationRoute,
} from "@lospor/core/clinical-rule-vocabulary"
import type { PediatricAgeInput } from "@lospor/core/pediatric"
import type { PediatricDoseProfile } from "@lospor/core/pediatric-dose"
import {
  applicablePediatricDrugProfiles,
  resolvePediatricDrugProfileSurface,
  type PediatricDrugProfileRule,
} from "@lospor/core/clinical-rules"
import type { DrugFormulation } from "@/lib/intraop-log-event"
import type {
  DrugEntryDraft,
  DrugRuleSelection,
} from "@/lib/use-drug-entry"
import {
  applicablePediatricDoseProfiles,
  resolvePediatricProfileDose,
} from "@/lib/pediatric-dose-ui"

type DrugOption = { name: string; unit: string }
type DrugCat = { cat: string; color: string; drugs: DrugOption[] }
type Range = { min: number; max: number; step: number }
type DoseSurface = Range & {
  mode?: string
  quickValues: number[]
  unit: string
  concentrationOptions?: string[]
  suggestedConcentration?: string
  defaultConcentration?: string
  suggestedVolume?: number
  suggestedVolumeByRoute?: Record<string, number>
  formulationOptions?: DrugFormulation[]
  defaultFormulation?: DrugFormulation
}

function fallbackRange(unit: string): Range {
  if (unit === "mcg") return { min: 0, max: 2000, step: 10 }
  if (unit === "g")   return { min: 0, max: 10,   step: 0.5 }
  if (unit === "ml" || unit === "mL") return { min: 0, max: 100, step: 1 }
  if (unit === "IU")  return { min: 0, max: 200,  step: 5 }
  return { min: 0, max: 500, step: 5 }
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

type Calc = { perKg?: number; flat?: number; basis?: string; roundTo?: number; cap?: number }
type DoseCalc = Calc & { hint: string; byRoute?: Record<string, Calc> }

export function DrugSheet({
  visible, onClose, drugCats, favouriteNames, scenarios, drugCat, setDrugCat, drugPick, setDrugPick,
  drugDose, setDrugDose, dosePresets, canStartAsInfusion, onConfirm, onStartAsInfusion,
  routes = {}, drugRoute, setDrugRoute, laConcentrations = {}, drugConcentration, setDrugConcentration,
  drugCustomConcentration, setDrugCustomConcentration, drugFormulation, setDrugFormulation,
  drugRule, applyDrugSelection,
  ranges = {}, baseProfiles = {}, routeProfiles = {},
  doseCalcs, patientWeightKg, patientHeightCm, patientSex, pediatricMode = false,
  pediatricDrugProfiles = [], pediatricDoseProfiles = [], patientAge, pediatricRulesSource, pediatricRulesCachedAt,
  pediatricRulesLoading, pediatricRulesError,
}: {
  visible: boolean
  onClose: () => void
  drugCats: DrugCat[]
  favouriteNames: string[]
  scenarios: ScenarioGroup[]
  drugCat: DrugCat | null
  setDrugCat: (c: DrugCat | null) => void
  drugPick: DrugOption | null
  setDrugPick: (d: DrugOption | null) => void
  drugDose: string
  setDrugDose: (v: string) => void
  dosePresets: Record<string, number[]>
  canStartAsInfusion: boolean
  onConfirm: () => void
  onStartAsInfusion: () => void
  routes?: Record<string, string[]>
  drugRoute?: string
  setDrugRoute?: (r: string) => void
  laConcentrations?: Record<string, string[]>
  drugConcentration?: string
  setDrugConcentration?: (c: string | undefined) => void
  drugCustomConcentration?: string
  setDrugCustomConcentration?: (value: string | undefined) => void
  drugFormulation?: DrugFormulation
  setDrugFormulation?: (value: DrugFormulation | undefined) => void
  drugRule?: DrugRuleSelection
  applyDrugSelection?: (selection: DrugEntryDraft) => void
  ranges?: Record<string, Range>
  baseProfiles?: Record<string, DoseSurface>
  routeProfiles?: Record<string, Record<string, DoseSurface>>
  doseCalcs?: Record<string, DoseCalc>
  patientWeightKg?: number
  patientHeightCm?: number
  patientSex?: string
  pediatricMode?: boolean
  pediatricDrugProfiles?: readonly PediatricDrugProfileRule[]
  pediatricDoseProfiles?: readonly PediatricDoseProfile[]
  patientAge?: PediatricAgeInput | null
  pediatricRulesSource?: "server" | "cache" | null
  pediatricRulesCachedAt?: string | null
  pediatricRulesLoading?: boolean
  pediatricRulesError?: string | null
}) {
  const { tc, language } = usePreferences()
  const drugLabel = (name: string) => displayClinicalCode("option:INTRAOP_DRUG", name, language, { label: name })
  const groupLabel = (name: string) => displayClinicalCode("optionGroup", name, language, { label: name })
  const scenarioLabel = (group: ScenarioGroup) => displayClinicalCode("scenarioGroup", group.key, language, { label: group.label })
  const [mode, setMode] = useState<"home" | "favourites" | "scenario" | "browse">("home")

  function calcSuggestedDose(name: string, route?: string): { dose: string; hint: string } {
    if (pediatricMode) return { dose: "", hint: "" }
    return calcDose(doseCalcs?.[name], route, { weightKg: patientWeightKg, heightCm: patientHeightCm, sex: patientSex })
  }
  const [scenario, setScenario] = useState<ScenarioGroup | null>(null)
  const [query, setQuery] = useState("")
  // True when the current drug was chosen from a scenario/favourites/browse
  // (selectCanonical sets drugCat only for metadata). Back then returns to that
  // menu instead of dropping into the drug's library category.
  const [pickedViaShortcut, setPickedViaShortcut] = useState(false)

  // Reset internal navigation to the home menu each time the sheet opens, so
  // adding e.g. an Induction drug doesn't leave the next "Add drug" landing on
  // the Induction subcategory. drugPick/drugCat keep render priority, so
  // preset-open flows (openDrugPreset) are unaffected.
  useEffect(() => {
    if (visible) { setMode("home"); setScenario(null); setQuery(""); setPickedViaShortcut(false) }
  }, [visible])

  const allDrugs = useMemo(() => drugCats
    .flatMap(cat => cat.drugs.map(drug => ({ ...drug, cat, color: cat.color })))
    .filter(drug => {
      if (!pediatricMode) return true
      const profiles = applicablePediatricDrugProfiles({
        medicationKey: drug.name,
        age: patientAge ?? null,
        weightKg: patientWeightKg,
        profiles: pediatricDrugProfiles,
      })
      return !profiles.some(profile => profile.availability === "HIDDEN")
    }), [drugCats, patientAge, patientWeightKg, pediatricDrugProfiles, pediatricMode])
  const byName = useMemo(() => new Map(allDrugs.map(drug => [drug.name, drug])), [allDrugs])

  const structuredPediatricProfilesForDrug = drugPick
    ? applicablePediatricDrugProfiles({
        medicationKey: drugPick.name,
        age: patientAge ?? null,
        weightKg: patientWeightKg,
        profiles: pediatricDrugProfiles,
      })
    : []
  const selectedStructuredPediatricProfile = structuredPediatricProfilesForDrug.find(
    profile => profile.ruleKey === drugRule?.key,
  ) ?? structuredPediatricProfilesForDrug[0] ?? null
  const structuredPediatricSurface = selectedStructuredPediatricProfile && patientAge
    ? resolvePediatricDrugProfileSurface({
        rule: selectedStructuredPediatricProfile,
        age: patientAge,
        route: drugRoute,
        weightKg: patientWeightKg,
        heightCm: patientHeightCm,
        sex: patientSex,
      })
    : null
  // Legacy dose profiles remain a read-only fallback for cached snapshots
  // created before PEDIATRIC_DRUG_PROFILE was added to the runtime contract.
  const pediatricProfilesForDrug = pediatricDrugProfiles.length === 0 && drugPick
    ? applicablePediatricDoseProfiles({
        medicationKey: drugPick.name,
        age: patientAge ?? null,
        profiles: pediatricDoseProfiles,
      })
    : []
  const selectedPediatricProfile = pediatricProfilesForDrug.find(
    profile => profile.key === drugRule?.key,
  ) ?? (pediatricProfilesForDrug.length === 1 ? pediatricProfilesForDrug[0] : null)
  const pediatricResolution = selectedPediatricProfile && patientAge
    ? resolvePediatricProfileDose({
        profile: selectedPediatricProfile,
        age: patientAge,
        weightKg: patientWeightKg,
        heightCm: patientHeightCm,
      })
    : null
  const pediatricAmount = pediatricResolution?.status === "AVAILABLE"
    ? pediatricResolution.amount
    : structuredPediatricSurface?.dose && Number.isFinite(Number(structuredPediatricSurface.dose))
      ? Number(structuredPediatricSurface.dose)
      : null
  function canonicalRoute(route: string | undefined): string | undefined {
    return route ? normalizeAdministrationRoute(route) ?? route : undefined
  }

  function canonicalUnit(unit: string): string {
    return canonicalDoseUnit(unit)?.display ?? unit
  }

  function canonicalRoutes(name: string): string[] {
    return Array.from(new Set((routes[name] ?? []).map(route => canonicalRoute(route) ?? route)))
  }

  function profileForRoute(name: string, route: string | undefined): DoseSurface | undefined {
    const canonical = canonicalRoute(route)
    const routeSurfaces = routeProfiles[name] ?? {}
    if (canonical && routeSurfaces[canonical]) return routeSurfaces[canonical]
    const aliasMatch = canonical
      ? Object.entries(routeSurfaces).find(([candidate]) => canonicalRoute(candidate) === canonical)?.[1]
      : undefined
    return aliasMatch ?? baseProfiles[name]
  }

  function ruleFromProfile(profile: PediatricDoseProfile): DrugRuleSelection {
    return {
      key: profile.key,
      version: profile.version,
      sourceIds: [...profile.sourceIds],
      roundTo: profile.roundTo,
    }
  }

  function ruleFromStructuredProfile(
    profile: PediatricDrugProfileRule,
    route: string,
  ): DrugRuleSelection {
    const routeMode = profile.profile?.routeModes?.[route]
    const doseCalc = routeMode?.doseCalc
      ?? profile.profile?.doseCalcByRoute?.[route]
      ?? profile.profile?.doseCalc
    return {
      key: profile.ruleKey,
      version: profile.ruleVersion,
      sourceIds: [...profile.sourceIds],
      roundTo: doseCalc?.roundTo,
    }
  }

  function replaceSelection(selection: DrugEntryDraft) {
    if (applyDrugSelection) {
      applyDrugSelection(selection)
      return
    }
    setDrugPick(selection.pick)
    setDrugDose(selection.dose)
    setDrugRoute?.(selection.route ?? "")
    setDrugConcentration?.(selection.concentration)
    setDrugCustomConcentration?.(selection.customConcentration)
    setDrugFormulation?.(selection.formulation)
  }

  function pediatricDraft(
    drug: DrugOption,
    route: string | undefined,
    candidates: readonly PediatricDoseProfile[],
  ): DrugEntryDraft {
    const canonical = canonicalRoute(route)
    const matching = candidates.filter(profile => canonicalRoute(profile.route) === canonical)
    const profile = matching.length === 1 ? matching[0] : undefined
    const resolution = profile && patientAge
      ? resolvePediatricProfileDose({
          profile,
          age: patientAge,
          weightKg: patientWeightKg,
          heightCm: patientHeightCm,
        })
      : null
    return {
      pick: { ...drug, unit: canonicalUnit(profile?.doseUnit ?? drug.unit) },
      dose: resolution?.status === "AVAILABLE" ? String(resolution.amount) : "",
      route: canonical,
      rule: profile ? ruleFromProfile(profile) : undefined,
    }
  }

  function structuredPediatricDraft(
    drug: DrugOption,
    route: string | undefined,
    profile: PediatricDrugProfileRule,
  ): DrugEntryDraft {
    if (!patientAge) {
      const fallbackRoute = canonicalRoute(route)
        ?? canonicalRoute(profile.profile?.defaultRoute)
        ?? canonicalRoute(profile.profile?.routes[0])
      return {
        pick: { ...drug, unit: canonicalUnit(profile.profile?.unit ?? profile.manualUnit ?? drug.unit) },
        dose: "",
        route: fallbackRoute,
        rule: fallbackRoute ? ruleFromStructuredProfile(profile, fallbackRoute) : undefined,
      }
    }
    const surface = resolvePediatricDrugProfileSurface({
      rule: profile,
      age: patientAge,
      route,
      weightKg: patientWeightKg,
      heightCm: patientHeightCm,
      sex: patientSex,
    })
    if (!surface) return { pick: drug, dose: "", route: canonicalRoute(route) }
    return {
      pick: { ...drug, unit: canonicalUnit(surface.unit) },
      // Quick pills remain clinician choices. If the configured calculation
      // basis is unavailable (for example McLaren IBW cannot be resolved),
      // keep the dose manual instead of silently selecting the first pill.
      dose: surface.dose,
      route: surface.route,
      concentration: surface.concentration || undefined,
      formulation: surface.formulation,
      rule: ruleFromStructuredProfile(profile, surface.route),
    }
  }

  function adultDraft(drug: DrugOption, route: string | undefined): DrugEntryDraft {
    const canonical = canonicalRoute(route)
    const profile = profileForRoute(drug.name, canonical)
    const concentrations = profile?.mode === "concentration"
      ? profile.concentrationOptions ?? laConcentrations[drug.name] ?? []
      : []
    const doseSuggestion = calcSuggestedDose(drug.name, canonical).dose
    const routeVolume = canonical ? profile?.suggestedVolumeByRoute?.[canonical] : undefined
    const fallbackDose = routeVolume
      ?? profile?.suggestedVolume
      ?? profile?.quickValues?.[0]
      ?? dosePresets[drug.name]?.[0]
    return {
      pick: { ...drug, unit: canonicalUnit(profile?.unit ?? drug.unit) },
      dose: doseSuggestion || (fallbackDose != null ? String(fallbackDose) : ""),
      route: canonical,
      concentration: concentrations.length
        ? profile?.suggestedConcentration ?? profile?.defaultConcentration ?? concentrations[0]
        : undefined,
      formulation: profile?.defaultFormulation ?? profile?.formulationOptions?.[0],
    }
  }

  const activeRoute = drugPick
    ? structuredPediatricSurface?.route
      ?? canonicalRoute(drugRoute ?? routes[drugPick.name]?.[0])
    : undefined
  const activeProfile = !pediatricMode && drugPick
    ? profileForRoute(drugPick.name, activeRoute)
    : undefined
  const activeUnit = canonicalUnit(
    structuredPediatricSurface?.unit
      ?? selectedPediatricProfile?.doseUnit
      ?? activeProfile?.unit
      ?? drugPick?.unit
      ?? "mg",
  )
  const activeQuickValues = pediatricMode
    ? structuredPediatricSurface
      ? Array.from(new Set([
          ...(pediatricAmount != null ? [pediatricAmount] : []),
          ...structuredPediatricSurface.quickValues,
        ]))
      : pediatricAmount != null ? [pediatricAmount] : []
    : activeProfile?.quickValues?.length ? activeProfile.quickValues : drugPick ? dosePresets[drugPick.name] : undefined
  const activeConcentrations = pediatricMode
    ? structuredPediatricSurface?.concentrationOptions
    : activeProfile?.mode === "concentration"
      ? activeProfile.concentrationOptions ?? laConcentrations[drugPick?.name ?? ""]
      : undefined
  const activeFormulations = pediatricMode
    ? structuredPediatricSurface?.formulationOptions
    : activeProfile?.formulationOptions
  const activeRoutes = drugPick
    ? pediatricMode && structuredPediatricSurface
      ? [...structuredPediatricSurface.routes]
      : pediatricMode && pediatricProfilesForDrug.length
        ? Array.from(new Set(pediatricProfilesForDrug.map(profile => canonicalRoute(profile.route) ?? profile.route)))
      : canonicalRoutes(drugPick.name)
    : []
  const pediatricStep = selectedPediatricProfile?.roundTo ?? (activeUnit === "mcg" ? 1 : 0.1)
  const pediatricMax = Math.max(
    selectedPediatricProfile?.maximumAmount ?? 0,
    pediatricAmount != null ? pediatricAmount * 2 : 0,
    pediatricStep * 10,
  )
  const activeRange = structuredPediatricSurface
    ? {
        min: structuredPediatricSurface.min,
        max: structuredPediatricSurface.max,
        step: structuredPediatricSurface.step,
      }
    : selectedPediatricProfile
      ? { min: 0, max: pediatricMax, step: pediatricStep }
      : pediatricMode
        ? { min: 0, max: 100_000, step: 0.1 }
      : activeProfile
        ? { min: activeProfile.min, max: activeProfile.max, step: activeProfile.step }
        : drugPick ? (ranges[drugPick.name] ?? fallbackRange(activeUnit)) : fallbackRange("mg")
  function selectDrug(drug: DrugOption) {
    const firstRoute = canonicalRoutes(drug.name)[0]
    if (pediatricMode) {
      const structuredCandidates = applicablePediatricDrugProfiles({
        medicationKey: drug.name,
        age: patientAge ?? null,
        weightKg: patientWeightKg,
        profiles: pediatricDrugProfiles,
      })
      if (structuredCandidates.length) {
        replaceSelection(structuredPediatricDraft(drug, firstRoute, structuredCandidates[0]))
        return
      }
      const candidates = applicablePediatricDoseProfiles({
        medicationKey: drug.name,
        age: patientAge ?? null,
        profiles: pediatricDoseProfiles,
      })
      const defaultRoute = firstRoute ?? canonicalRoute(candidates[0]?.route)
      replaceSelection(pediatricDraft(drug, defaultRoute, candidates))
      return
    }
    replaceSelection(adultDraft(drug, firstRoute))
  }

  function selectCanonical(canonical: string) {
    const found = byName.get(canonical)
    if (!found) return
    setPickedViaShortcut(true)
    setDrugCat(found.cat)
    selectDrug({ name: found.name, unit: found.unit })
  }

  function changeRoute(route: string) {
    if (!drugPick) return
    if (pediatricMode && selectedStructuredPediatricProfile) {
      replaceSelection(structuredPediatricDraft(drugPick, route, selectedStructuredPediatricProfile))
      return
    }
    replaceSelection(pediatricMode
      ? pediatricDraft(drugPick, route, pediatricProfilesForDrug)
      : adultDraft(drugPick, route))
  }

  const filtered = query.trim()
    ? allDrugs.filter(drug => [drug.name, drugLabel(drug.name)].some(value => value.toLowerCase().includes(query.trim().toLowerCase())))
    : []
  const scenarioItems = scenario?.items
    .map(entry => ({ entry, drug: byName.get(entry.canonical) }))
    .filter((row): row is { entry: { label: string; canonical: string }; drug: NonNullable<ReturnType<typeof byName.get>> } => !!row.drug) ?? []
  const favouriteItems = favouriteNames
    .map(name => byName.get(name))
    .filter((drug): drug is NonNullable<typeof drug> => !!drug)
  const confirmDisabled = !drugDose
    || (!!activeConcentrations?.length && !drugConcentration)
    || (!!activeFormulations?.length && !drugFormulation)
    || (pediatricMode && !structuredPediatricSurface && pediatricProfilesForDrug.length > 1 && !selectedPediatricProfile)
  const footer = drugPick ? (
    <FeedbackPressable
      testID="drug-sheet-confirm"
      accessibilityState={{ disabled: confirmDisabled }}
      onPress={onConfirm}
      disabled={confirmDisabled}
      style={{
        backgroundColor: confirmDisabled ? "#1e2d40" : drugCat?.color ?? "#3b82f6",
        borderRadius: 14,
        padding: 18,
        alignItems: "center",
      }}
    >
      <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
        {tc("dsAdd")} {drugLabel(drugPick.name)} {drugDose} {activeUnit}
      </Text>
    </FeedbackPressable>
  ) : undefined

  return (
    <Sheet visible={visible} onClose={onClose}
      title={drugPick ? drugLabel(drugPick.name) : drugCat ? groupLabel(drugCat.cat) : mode === "browse" ? tc("dsBrowseDrugs") : mode === "favourites" ? tc("dsFavouriteDrugs") : scenario ? scenarioLabel(scenario) : tc("dsAddDrug")} footer={footer} full>
      {drugPick ? (
        <View>
          <TouchableOpacity onPress={() => { setDrugPick(null); if (pickedViaShortcut) { setDrugCat(null); setPickedViaShortcut(false) } }} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <View style={{ marginBottom: canStartAsInfusion ? 10 : 0 }}>
            {pediatricMode ? (
              <View style={{ marginBottom: 10, gap: 8 }}>
                {pediatricRulesLoading ? (
                  <Text style={{ color: "#94a3b8", fontSize: 12, lineHeight: 17 }}>
                    {language === "bg" ? "Зареждане на одобрения институционален набор..." : "Loading the approved institution preset..."}
                  </Text>
                ) : null}
                {pediatricRulesSource === "cache" ? (
                  <Text style={{ color: "#fbbf24", fontSize: 12, lineHeight: 17 }}>
                    {language === "bg"
                      ? `Използва се последният запазен институционален набор${pediatricRulesCachedAt ? ` от ${new Date(pediatricRulesCachedAt).toLocaleString()}` : ""}.`
                      : `Using the last cached institution preset${pediatricRulesCachedAt ? ` from ${new Date(pediatricRulesCachedAt).toLocaleString()}` : ""}.`}
                  </Text>
                ) : null}
                {!pediatricRulesLoading
                  && structuredPediatricProfilesForDrug.length === 0
                  && pediatricProfilesForDrug.length === 0 ? (
                  <Text style={{ color: "#fbbf24", fontSize: 12, lineHeight: 17 }}>
                    {language === "bg"
                      ? "Няма приложим одобрен дозов профил. Въведете ръчно проверена доза."
                      : "No applicable approved dose profile is available. Enter a manually verified dose."}
                    {pediatricRulesError ? ` ${pediatricRulesError}` : ""}
                  </Text>
                ) : null}
                {structuredPediatricSurface?.dose && selectedStructuredPediatricProfile ? (
                  <Text style={{ color: "#4ade80", fontSize: 12, lineHeight: 17 }}>
                    {language === "bg" ? "Одобрена институционална доза" : "Approved institution dose"}: {structuredPediatricSurface.dose} {structuredPediatricSurface.unit} · {selectedStructuredPediatricProfile.ruleVersion}
                  </Text>
                ) : structuredPediatricSurface && selectedStructuredPediatricProfile ? (
                  <Text style={{ color: "#fbbf24", fontSize: 12, lineHeight: 17 }}>
                    {language === "bg" ? "Дозата не може да бъде изчислена автоматично" : "The dose cannot be calculated automatically"}: {structuredPediatricSurface.calculationUnavailableReason ?? "NO_AUTOFILL"}
                  </Text>
                ) : selectedPediatricProfile && pediatricResolution?.status === "AVAILABLE" ? (
                  <Text style={{ color: "#4ade80", fontSize: 12, lineHeight: 17 }}>
                    {language === "bg" ? "Одобрена институционална доза" : "Approved institution dose"}: {pediatricResolution.amount} {pediatricResolution.doseUnit} · {selectedPediatricProfile.version}
                  </Text>
                ) : selectedPediatricProfile && pediatricResolution ? (
                  <Text style={{ color: "#fbbf24", fontSize: 12, lineHeight: 17 }}>
                    {language === "bg" ? "Дозата не може да бъде изчислена автоматично" : "The dose cannot be calculated automatically"}: {pediatricResolution.status}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <DoseSelector
              color={drugCat?.color ?? "#3b82f6"}
              quickValues={activeQuickValues}
              manualEntryOnly={pediatricMode && (
                structuredPediatricSurface?.manualEntryOnly
                || (!structuredPediatricSurface && !selectedPediatricProfile)
              )}
              value={drugDose} onValueChange={setDrugDose}
              {...activeRange}
              valuePlaceholder={`${tc("dsCustomUnit")} ${activeUnit}`}
              unitSuffix={activeUnit}
              routes={activeRoutes} route={activeRoute} onRouteChange={changeRoute}
              concentrationOptions={activeConcentrations}
              concentrationUnit={structuredPediatricSurface?.concentrationUnit}
              concentration={drugConcentration}
              onConcentrationChange={value => replaceSelection({
                pick: drugPick,
                dose: drugDose,
                route: activeRoute,
                concentration: value,
                formulation: drugFormulation,
                rule: drugRule,
              })}
              customConcentration={drugCustomConcentration}
              onCustomConcentrationChange={value => replaceSelection({
                pick: drugPick,
                dose: drugDose,
                route: activeRoute,
                concentration: value?.trim()
                  ? `${value.trim()}${structuredPediatricSurface?.concentrationUnit === "PERCENT" ? "%" : ""}`
                  : undefined,
                customConcentration: value,
                formulation: drugFormulation,
                rule: drugRule,
              })}
              formulationOptions={activeFormulations}
              formulation={drugFormulation}
              onFormulationChange={value => replaceSelection({
                pick: drugPick,
                dose: drugDose,
                route: activeRoute,
                concentration: drugConcentration,
                customConcentration: drugCustomConcentration,
                formulation: value,
                rule: drugRule,
              })}
            />
            {!pediatricMode && doseCalcs?.[drugPick.name]?.hint ? (
              <Text style={{ color:"#64748b", fontSize:11, marginTop:6, marginBottom:4, textAlign:"center" }}>
                {doseCalcs[drugPick.name].hint}
              </Text>
            ) : null}
          </View>
          {canStartAsInfusion && (
            <TouchableOpacity onPress={onStartAsInfusion}
              style={{ backgroundColor:"#111820", borderRadius:14, padding:16, alignItems:"center",
                borderWidth:1, borderColor: (drugCat?.color ?? "#3b82f6") + "66" }}>
              <Text style={{ color: drugCat?.color ?? "#93c5fd", fontSize:14, fontWeight:"700" }}>
                {tc("dsStartAsInfusion").replace("{name}", drugLabel(drugPick.name))}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : drugCat ? (
        <View>
          <TouchableOpacity onPress={() => setDrugCat(null)} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {drugCat.drugs.map(drug => (
              <Pill key={drug.name} label={drugLabel(drug.name)} sublabel={drug.unit} color={drugCat.color} onPress={() => { setPickedViaShortcut(false); selectDrug(drug) }} />
            ))}
          </View>
        </View>
      ) : mode === "scenario" && scenario ? (
        <View>
          <TouchableOpacity onPress={() => { setScenario(null); setMode("home") }} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {scenarioItems.map(({ entry, drug }) => (
              <Pill key={entry.canonical} label={drugLabel(entry.canonical)} sublabel={drug.unit} color={scenario.color} onPress={() => selectCanonical(entry.canonical)} />
            ))}
          </View>
        </View>
      ) : mode === "favourites" ? (
        <View>
          <TouchableOpacity onPress={() => setMode("home")} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          {favouriteItems.length === 0 ? (
            <Text style={{ color:"#64748b", fontSize:13, lineHeight:18 }}>{tc("dsNoFavourites")}</Text>
          ) : (
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
              {favouriteItems.map(drug => (
                <Pill key={drug.name} label={drugLabel(drug.name)} sublabel={drug.unit} color={drug.color} onPress={() => selectCanonical(drug.name)} />
              ))}
            </View>
          )}
        </View>
      ) : mode === "browse" ? (
        <View>
          <TouchableOpacity onPress={() => { setQuery(""); setMode("home") }} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tc("dsSearchDrugs")}
            placeholderTextColor="#475569"
            style={{ backgroundColor:"#111820", color:"#e2e8f0", borderRadius:10, paddingHorizontal:12, paddingVertical:10,
              borderWidth:1, borderColor:"#1e2d40", marginBottom:14 }}
          />
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {(query.trim() ? filtered : drugCats).map(item => "cat" in item && "drugs" in item ? (
              <Pill key={item.cat} label={groupLabel(item.cat)} sublabel={`${item.drugs.length} drugs`} color={item.color} onPress={() => setDrugCat(item)} />
            ) : (
              <Pill key={item.name} label={drugLabel(item.name)} sublabel={item.unit} color={item.color} onPress={() => selectCanonical(item.name)} />
            ))}
          </View>
        </View>
      ) : (
        <View>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10, marginBottom:16 }}>
            <Pill label={tc("dsFavourites")} sublabel={`${favouriteItems.length || 0} ${tc("dsSelected")}`} color="#38bdf8" onPress={() => setMode("favourites")} wide />
          </View>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {scenarios.map(group => (
              <Pill key={group.key} label={scenarioLabel(group)} sublabel={group.items.slice(0, 2).map(i => drugLabel(i.canonical)).join(", ")} color={group.color}
                onPress={() => { setScenario(group); setMode("scenario") }} />
            ))}
          </View>
          <View style={{ marginTop:18 }}>
            <Pill label={tc("dsBrowseAllDrugs")} sublabel={tc("dsSearchCanonical")} color="#64748b" onPress={() => setMode("browse")} wide />
          </View>
        </View>
      )}
    </Sheet>
  )
}
