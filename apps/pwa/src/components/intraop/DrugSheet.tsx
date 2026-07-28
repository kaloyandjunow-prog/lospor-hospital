import { useEffect, useMemo, useState } from "react"
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native"
import { Sheet } from "@/components/intraop/Sheet"
import { usePreferences } from "@/lib/preferences-context"
import { displayClinicalCode } from "@/lib/clinical-display"
import { DoseSelector } from "@/components/intraop/DoseSelector"
import type { ScenarioGroup } from "@lospor/core"
import { calcSuggestedDose as calcDose } from "@/lib/dose-calc"

type DrugOption = { name: string; unit: string }
type DrugCat = { cat: string; color: string; drugs: DrugOption[] }
type Range = { min: number; max: number; step: number }
type DoseSurface = Range & {
  mode?: string
  quickValues: number[]
  unit: string
  concentrationOptions?: string[]
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
  ranges = {}, baseProfiles = {}, routeProfiles = {},
  doseCalcs, patientWeightKg, patientHeightCm, patientSex,
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
  ranges?: Record<string, Range>
  baseProfiles?: Record<string, DoseSurface>
  routeProfiles?: Record<string, Record<string, DoseSurface>>
  doseCalcs?: Record<string, DoseCalc>
  patientWeightKg?: number
  patientHeightCm?: number
  patientSex?: string
}) {
  const { tc, language } = usePreferences()
  const drugLabel = (name: string) => displayClinicalCode("option:INTRAOP_DRUG", name, language, { label: name })
  const groupLabel = (name: string) => displayClinicalCode("optionGroup", name, language, { label: name })
  const scenarioLabel = (group: ScenarioGroup) => displayClinicalCode("scenarioGroup", group.key, language, { label: group.label })
  const [mode, setMode] = useState<"home" | "favourites" | "scenario" | "browse">("home")

  function calcSuggestedDose(name: string, route?: string): { dose: string; hint: string } {
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

  const allDrugs = useMemo(() =>
    drugCats.flatMap(cat => cat.drugs.map(drug => ({ ...drug, cat, color: cat.color }))),
  [drugCats])
  const byName = useMemo(() => new Map(allDrugs.map(drug => [drug.name, drug])), [allDrugs])

  const activeRoute = drugPick ? (drugRoute ?? routes[drugPick.name]?.[0]) : undefined
  const activeProfile = drugPick
    ? (activeRoute ? routeProfiles[drugPick.name]?.[activeRoute] : undefined) ?? baseProfiles[drugPick.name]
    : undefined
  const activeUnit = activeProfile?.unit ?? drugPick?.unit ?? "mg"
  const activeQuickValues = activeProfile?.quickValues?.length ? activeProfile.quickValues : drugPick ? dosePresets[drugPick.name] : undefined
  const activeConcentrations = activeProfile?.mode === "concentration"
    ? activeProfile.concentrationOptions ?? laConcentrations[drugPick?.name ?? ""]
    : undefined
  const activeRange = activeProfile
    ? { min: activeProfile.min, max: activeProfile.max, step: activeProfile.step }
    : drugPick ? (ranges[drugPick.name] ?? fallbackRange(activeUnit)) : fallbackRange("mg")

  function selectDrug(drug: DrugOption) {
    const firstRoute = routes[drug.name]?.[0]
    const profile = (firstRoute ? routeProfiles[drug.name]?.[firstRoute] : undefined) ?? baseProfiles[drug.name]
    const unit = profile?.unit ?? drug.unit
    setDrugPick({ ...drug, unit })
    setDrugRoute?.(firstRoute ?? "")
    setDrugConcentration?.(undefined)
    const suggested = calcSuggestedDose(drug.name, firstRoute)
    setDrugDose(suggested.dose)
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
    const profile = routeProfiles[drugPick.name]?.[route] ?? baseProfiles[drugPick.name]
    setDrugRoute?.(route)
    setDrugConcentration?.(undefined)
    if (profile?.unit) setDrugPick({ ...drugPick, unit: profile.unit })
    // Recompute the per-route suggested dose (e.g. Lidocaine IV 1 mg/kg) instead
    // of clearing — concentration routes have no doseCalc, so this clears to "".
    setDrugDose(calcSuggestedDose(drugPick.name, route).dose)
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

  return (
    <Sheet visible={visible} onClose={onClose}
      title={drugPick ? drugLabel(drugPick.name) : drugCat ? groupLabel(drugCat.cat) : mode === "browse" ? tc("dsBrowseDrugs") : mode === "favourites" ? tc("dsFavouriteDrugs") : scenario ? scenarioLabel(scenario) : tc("dsAddDrug")} full>
      {drugPick ? (
        <View>
          <TouchableOpacity onPress={() => { setDrugPick(null); if (pickedViaShortcut) { setDrugCat(null); setPickedViaShortcut(false) } }} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <View style={{ marginBottom: canStartAsInfusion ? 10 : 0 }}>
            <DoseSelector
              color={drugCat?.color ?? "#3b82f6"}
              quickValues={activeQuickValues}
              value={drugDose} onValueChange={setDrugDose}
              {...activeRange}
              valuePlaceholder={`${tc("dsCustomUnit")} ${activeUnit}`}
              unitSuffix={activeUnit}
              routes={routes[drugPick.name]} route={activeRoute} onRouteChange={changeRoute}
              concentrationOptions={activeConcentrations}
              concentration={drugConcentration} onConcentrationChange={setDrugConcentration}
              confirmLabel={`${tc("dsAdd")} ${drugLabel(drugPick.name)} ${drugDose} ${activeUnit}`}
              onConfirm={onConfirm} confirmDisabled={!drugDose}
            />
            {doseCalcs?.[drugPick.name]?.hint ? (
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
        <ScrollView showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => setDrugCat(null)} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {drugCat.drugs.map(drug => (
              <Pill key={drug.name} label={drugLabel(drug.name)} sublabel={drug.unit} color={drugCat.color} onPress={() => { setPickedViaShortcut(false); selectDrug(drug) }} />
            ))}
          </View>
        </ScrollView>
      ) : mode === "scenario" && scenario ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => { setScenario(null); setMode("home") }} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {scenarioItems.map(({ entry, drug }) => (
              <Pill key={entry.canonical} label={drugLabel(entry.canonical)} sublabel={drug.unit} color={scenario.color} onPress={() => selectCanonical(entry.canonical)} />
            ))}
          </View>
        </ScrollView>
      ) : mode === "favourites" ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => setMode("home")} style={{ marginBottom:14 }}>
            <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
          </TouchableOpacity>
          {favouriteItems.length === 0 ? (
            <Text style={{ color:"#64748b", fontSize:13, lineHeight:18 }}>Choose favourite bolus drugs in Settings.</Text>
          ) : (
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
              {favouriteItems.map(drug => (
                <Pill key={drug.name} label={drugLabel(drug.name)} sublabel={drug.unit} color={drug.color} onPress={() => selectCanonical(drug.name)} />
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
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
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
        </ScrollView>
      )}
    </Sheet>
  )
}
