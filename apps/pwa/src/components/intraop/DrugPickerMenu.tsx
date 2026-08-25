import { Text, TextInput, TouchableOpacity, View } from "react-native"
import type { ScenarioGroup } from "@lospor/core"
import { MedicationPickerPill } from "@/components/intraop/MedicationPickerPill"
import type { SearchOnlyMedicationOption } from "@/lib/hidden-clinical-options"
import type { ClinicalStringKey } from "@/lib/preferences-context"

export type DrugPickerOption = { name: string; unit: string }
export type DrugPickerCategory = {
  cat: string
  color: string
  drugs: DrugPickerOption[]
}
export type DrugPickerSearchResult = DrugPickerOption & {
  color: string
  searchOnly: SearchOnlyMedicationOption | null
}
export type DrugPickerMode = "home" | "favourites" | "scenario" | "browse"

type ShortcutDrug = DrugPickerOption & { color: string }
type ScenarioRow = {
  entry: { label: string; canonical: string }
  drug: ShortcutDrug
}

export function DrugPickerMenu({
  drugCat,
  mode,
  scenario,
  query,
  drugCats,
  filtered,
  scenarioItems,
  favouriteItems,
  routineScenarios,
  drugLabel,
  groupLabel,
  scenarioLabel,
  tc,
  onClearCategory,
  onPickCategoryDrug,
  onBackHome,
  onQueryChange,
  onOpenCategory,
  onSelectCanonical,
  onSelectSearchOnly,
  onOpenFavourites,
  onOpenScenario,
  onOpenBrowse,
}: {
  drugCat: DrugPickerCategory | null
  mode: DrugPickerMode
  scenario: ScenarioGroup | null
  query: string
  drugCats: DrugPickerCategory[]
  filtered: DrugPickerSearchResult[]
  scenarioItems: ScenarioRow[]
  favouriteItems: ShortcutDrug[]
  routineScenarios: ScenarioGroup[]
  drugLabel: (name: string) => string
  groupLabel: (name: string) => string
  scenarioLabel: (group: ScenarioGroup) => string
  tc: (key: ClinicalStringKey) => string
  onClearCategory: () => void
  onPickCategoryDrug: (drug: DrugPickerOption) => void
  onBackHome: () => void
  onQueryChange: (query: string) => void
  onOpenCategory: (category: DrugPickerCategory) => void
  onSelectCanonical: (name: string) => void
  onSelectSearchOnly: (option: SearchOnlyMedicationOption) => void
  onOpenFavourites: () => void
  onOpenScenario: (group: ScenarioGroup) => void
  onOpenBrowse: () => void
}) {
  if (drugCat) {
    return (
      <View>
        <TouchableOpacity onPress={onClearCategory} style={{ marginBottom:14 }}>
          <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
          {drugCat.drugs.map(drug => (
            <MedicationPickerPill
              key={drug.name}
              label={drugLabel(drug.name)}
              sublabel={drug.unit}
              color={drugCat.color}
              onPress={() => onPickCategoryDrug(drug)}
            />
          ))}
        </View>
      </View>
    )
  }

  if (mode === "scenario" && scenario) {
    return (
      <View>
        <TouchableOpacity onPress={onBackHome} style={{ marginBottom:14 }}>
          <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
          {scenarioItems.map(({ entry, drug }) => (
            <MedicationPickerPill
              key={entry.canonical}
              label={drugLabel(entry.canonical)}
              sublabel={drug.unit}
              color={scenario.color}
              onPress={() => onSelectCanonical(entry.canonical)}
            />
          ))}
        </View>
      </View>
    )
  }

  if (mode === "favourites") {
    return (
      <View>
        <TouchableOpacity onPress={onBackHome} style={{ marginBottom:14 }}>
          <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
        </TouchableOpacity>
        {favouriteItems.length === 0 ? (
          <Text style={{ color:"#64748b", fontSize:13, lineHeight:18 }}>{tc("dsNoFavourites")}</Text>
        ) : (
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
            {favouriteItems.map(drug => (
              <MedicationPickerPill
                key={drug.name}
                label={drugLabel(drug.name)}
                sublabel={drug.unit}
                color={drug.color}
                onPress={() => onSelectCanonical(drug.name)}
              />
            ))}
          </View>
        )}
      </View>
    )
  }

  if (mode === "browse") {
    return (
      <View>
        <TouchableOpacity onPress={onBackHome} style={{ marginBottom:14 }}>
          <Text style={{ color:"#94a3b8", fontSize:13 }}>{tc("back")}</Text>
        </TouchableOpacity>
        <TextInput
          testID="drug-search-input"
          value={query}
          onChangeText={onQueryChange}
          placeholder={tc("dsSearchDrugs")}
          placeholderTextColor="#475569"
          style={{ backgroundColor:"#111820", color:"#e2e8f0", borderRadius:10, paddingHorizontal:12, paddingVertical:10,
            borderWidth:1, borderColor:"#1e2d40", marginBottom:14 }}
        />
        <View style={{ flexDirection:"row", flexWrap:"wrap", gap:10 }}>
          {query.trim() ? filtered.map(item => (
            <MedicationPickerPill
              key={item.name}
              label={drugLabel(item.name)}
              sublabel={item.searchOnly
                ? `${item.unit} · ${tc("dsSearchOnlyManualBadge")}`
                : item.unit}
              color={item.color}
              onPress={() => item.searchOnly
                ? onSelectSearchOnly(item.searchOnly)
                : onSelectCanonical(item.name)}
            />
          )) : drugCats.map(category => (
            <MedicationPickerPill
              key={category.cat}
              label={groupLabel(category.cat)}
              sublabel={`${category.drugs.length} ${tc("dsDrugCountLabel")}`}
              color={category.color}
              onPress={() => onOpenCategory(category)}
            />
          ))}
        </View>
      </View>
    )
  }

  return (
    <View>
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
            sublabel={group.items.slice(0, 2).map(item => drugLabel(item.canonical)).join(", ")}
            color={group.color}
            onPress={() => onOpenScenario(group)}
          />
        ))}
      </View>
      <View style={{ marginTop:18 }}>
        <MedicationPickerPill
          label={tc("dsBrowseAllDrugs")}
          sublabel={tc("dsSearchCanonical")}
          color="#64748b"
          onPress={onOpenBrowse}
          wide
        />
      </View>
    </View>
  )
}
