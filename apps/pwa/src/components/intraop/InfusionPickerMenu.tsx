import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native"
import type { ScenarioGroup } from "@lospor/core"
import { MedicationPickerPill } from "@/components/intraop/MedicationPickerPill"
import type { SearchOnlyMedicationOption } from "@/lib/hidden-clinical-options"
import type { ClinicalStringKey } from "@/lib/preferences-context"

export type InfusionPickerOption = { name: string; unit: string; color: string }
export type InfusionPickerResult = InfusionPickerOption & {
  searchOnly: SearchOnlyMedicationOption | null
}
export type InfusionPickerMode = "home" | "favourites" | "scenario" | "browse"

type ScenarioRow = {
  entry: { label: string; canonical: string }
  drug: InfusionPickerOption
}

export function InfusionPickerMenu({
  mode,
  scenario,
  query,
  filtered,
  scenarioItems,
  favouriteItems,
  routineScenarios,
  infusionLabel,
  scenarioLabel,
  tc,
  onBackHome,
  onQueryChange,
  onSelectRoutine,
  onSelectSearchOnly,
  onOpenFavourites,
  onOpenScenario,
  onOpenBrowse,
}: {
  mode: InfusionPickerMode
  scenario: ScenarioGroup | null
  query: string
  filtered: InfusionPickerResult[]
  scenarioItems: ScenarioRow[]
  favouriteItems: InfusionPickerOption[]
  routineScenarios: ScenarioGroup[]
  infusionLabel: (name: string) => string
  scenarioLabel: (group: ScenarioGroup) => string
  tc: (key: ClinicalStringKey) => string
  onBackHome: () => void
  onQueryChange: (query: string) => void
  onSelectRoutine: (drug: InfusionPickerOption) => void
  onSelectSearchOnly: (drug: SearchOnlyMedicationOption) => void
  onOpenFavourites: () => void
  onOpenScenario: (group: ScenarioGroup) => void
  onOpenBrowse: () => void
}) {
  if (mode === "scenario" && scenario) {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={onBackHome} style={{ marginBottom:14 }}>
          <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
          {scenarioItems.map(({ entry, drug }) => (
            <MedicationPickerPill
              key={entry.canonical}
              label={infusionLabel(entry.canonical)}
              sublabel={drug.unit}
              color={scenario.color}
              onPress={() => onSelectRoutine(drug)}
            />
          ))}
        </View>
      </ScrollView>
    )
  }

  if (mode === "favourites") {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={onBackHome} style={{ marginBottom:14 }}>
          <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
        </TouchableOpacity>
        {favouriteItems.length === 0 ? (
          <Text style={{ color:"#64748b", fontSize:13, lineHeight:18 }}>{tc("dsChooseFavourites")}</Text>
        ) : (
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {favouriteItems.map(drug => (
              <MedicationPickerPill
                key={drug.name}
                label={infusionLabel(drug.name)}
                sublabel={drug.unit}
                color={drug.color}
                onPress={() => onSelectRoutine(drug)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    )
  }

  if (mode === "browse") {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={onBackHome} style={{ marginBottom:14 }}>
          <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
        </TouchableOpacity>
        <TextInput
          testID="infusion-search-input"
          value={query}
          onChangeText={onQueryChange}
          placeholder={tc("dsSearchInfusions")}
          placeholderTextColor="#475569"
          style={{ backgroundColor:"#111820", color:"#e2e8f0", borderRadius:10, paddingHorizontal:12, paddingVertical:10,
            borderWidth:1, borderColor:"#1e2d40", marginBottom:14 }}
        />
        <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
          {filtered.map(drug => (
            <MedicationPickerPill
              key={drug.name}
              label={infusionLabel(drug.name)}
              sublabel={drug.searchOnly
                ? `${drug.unit} · ${tc("dsSearchOnlyManualBadge")}`
                : drug.unit}
              color={drug.color}
              onPress={() => drug.searchOnly
                ? onSelectSearchOnly(drug.searchOnly)
                : onSelectRoutine(drug)}
            />
          ))}
        </View>
      </ScrollView>
    )
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10, marginBottom:16 }}>
        <MedicationPickerPill
          label={tc("dsFavourites")}
          sublabel={`${favouriteItems.length || 0} ${tc("dsSelected")}`}
          color="#38bdf8"
          onPress={onOpenFavourites}
          wide
        />
      </View>
      <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
        {routineScenarios.map(group => (
          <MedicationPickerPill
            key={group.key}
            label={scenarioLabel(group)}
            sublabel={group.items.slice(0, 2).map(item => infusionLabel(item.canonical)).join(", ")}
            color={group.color}
            onPress={() => onOpenScenario(group)}
          />
        ))}
      </View>
      <View style={{ marginTop:18 }}>
        <MedicationPickerPill
          label={tc("dsBrowseAllInfusions")}
          sublabel={tc("dsSearchCanonicalList")}
          color="#64748b"
          onPress={onOpenBrowse}
          wide
        />
      </View>
    </ScrollView>
  )
}
