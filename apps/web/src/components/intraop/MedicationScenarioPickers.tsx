"use client"

import { BOLUS_SCENARIOS, INFUSION_SCENARIOS, type ScenarioGroup } from "@lospor/core"
import { ScenarioPicker, type BrowseCategory } from "./ScenarioPicker"
import { AnchoredPopover } from "./AnchoredPopover"
import { DRUG_GROUP_COLORS } from "@lospor/core/catalog"

type Labels = {
  favourites: string
  browseAll: string
  search: string
  empty: string
  favouritesHint: string
  back: string
  selected: string
  manualEntry: string
}

type PickerTranslationKey =
  | "intraop.timetable.favourites"
  | "intraop.timetable.browseAllDrugs"
  | "intraop.timetable.browseAllInfusions"
  | "intraop.timetable.searchDrug"
  | "intraop.timetable.searchInfusion"
  | "intraop.timetable.noDrugsFound"
  | "intraop.timetable.noInfusionsFound"
  | "intraop.timetable.favouritesHint"
  | "intraop.timetable.back"
  | "intraop.timetable.selected"
  | "intraop.timetable.manualEntry"

export function scenarioPickerLabels(
  translate: (key: PickerTranslationKey) => string,
  kind: "drug" | "infusion",
): Labels {
  return {
    favourites: translate("intraop.timetable.favourites"),
    browseAll: translate(kind === "drug" ? "intraop.timetable.browseAllDrugs" : "intraop.timetable.browseAllInfusions"),
    search: translate(kind === "drug" ? "intraop.timetable.searchDrug" : "intraop.timetable.searchInfusion"),
    empty: translate(kind === "drug" ? "intraop.timetable.noDrugsFound" : "intraop.timetable.noInfusionsFound"),
    favouritesHint: translate("intraop.timetable.favouritesHint"),
    back: translate("intraop.timetable.back"),
    selected: translate("intraop.timetable.selected"),
    manualEntry: translate("intraop.timetable.manualEntry"),
  }
}

type SharedProps = {
  favourites: string[]
  displayItem: (name: string) => string
  displayScenario: (group: ScenarioGroup) => string
  displayCategory: (category: string) => string
  onPick: (name: string, unit?: string, manualEntryOnly?: boolean) => void
  labels: Labels
}

export function BolusScenarioPicker({
  favourites,
  browse,
  searchOnly,
  ...shared
}: SharedProps & { browse: BrowseCategory[]; searchOnly: BrowseCategory[] }) {
  return (
    <ScenarioPicker
      scenarios={BOLUS_SCENARIOS}
      favourites={favourites}
      browse={browse}
      searchOnly={searchOnly}
      {...shared}
    />
  )
}

type InfusionConfig = { units: string[]; group?: string; customColor?: string }

export function InfusionScenarioPicker({
  favourites,
  configs,
  visibleNames,
  hiddenNames,
  ...shared
}: SharedProps & {
  configs: Record<string, InfusionConfig>
  visibleNames: Set<string>
  hiddenNames: Set<string>
}) {
  const fallbackColor = "border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300"
  // Grouped as drugs are, in catalogue order and in the drug groups' colours;
  // an infusion without a group (a hospital's own) goes under "Other".
  const groups = (names: Set<string>, manualEntryOnly: boolean): BrowseCategory[] => {
    const byGroup = new Map<string, BrowseCategory>()
    for (const name of Object.keys(configs).filter(item => names.has(item))) {
      const cat = configs[name]?.group ?? "Other"
      if (!byGroup.has(cat)) byGroup.set(cat, { cat, color: DRUG_GROUP_COLORS[cat] ?? fallbackColor, items: [] })
      byGroup.get(cat)!.items.push({
        name,
        unit: configs[name]?.units[0],
        ...(manualEntryOnly ? { manualEntryOnly: true } : {}),
        ...(configs[name]?.customColor ? { customColor: configs[name].customColor } : {}),
      })
    }
    return [...byGroup.values()]
  }

  return (
    <ScenarioPicker
      scenarios={INFUSION_SCENARIOS}
      favourites={favourites}
      browse={groups(visibleNames, false)}
      searchOnly={groups(hiddenNames, true)}
      {...shared}
    />
  )
}

export function MedicationPickerPortals({
  drugPicker,
  infusionPicker,
  closeDrug,
  closeInfusion,
  drugBrowse,
  hiddenDrugBrowse,
  infusionConfigs,
  visibleInfusionNames,
  hiddenInfusionNames,
  favouriteDrugs,
  favouriteInfusions,
  displayDrugName,
  displayInfusionName,
  displayScenarioName,
  displayGroupName,
  drugLabels,
  infusionLabels,
  onOpen,
}: {
  drugPicker: { ci: number; rect: DOMRect } | null
  infusionPicker: { ci: number; rect: DOMRect } | null
  closeDrug: () => void
  closeInfusion: () => void
  drugBrowse: BrowseCategory[]
  hiddenDrugBrowse: BrowseCategory[]
  infusionConfigs: Record<string, InfusionConfig>
  visibleInfusionNames: Set<string>
  hiddenInfusionNames: Set<string>
  favouriteDrugs: string[]
  favouriteInfusions: string[]
  displayDrugName: (name: string) => string
  displayInfusionName: (name: string) => string
  displayScenarioName: (group: ScenarioGroup) => string
  displayGroupName: (category: string) => string
  drugLabels: Labels
  infusionLabels: Labels
  onOpen: (
    column: number,
    name: string,
    unit: string,
    rect: DOMRect,
    mode: "bolus" | "infusion",
    manualEntryOnly?: boolean,
  ) => void
}) {
  return (
    <>
      {drugPicker ? (
        <AnchoredPopover anchor={drugPicker.rect} width={260} flipBelowSpace={320} onDismiss={closeDrug}>
          <BolusScenarioPicker
            favourites={favouriteDrugs}
            browse={drugBrowse}
            searchOnly={hiddenDrugBrowse}
            displayItem={displayDrugName}
            displayScenario={displayScenarioName}
            displayCategory={displayGroupName}
            onPick={(name, unit, manual) => {
              closeDrug()
              onOpen(drugPicker.ci, name, unit ?? "mg", drugPicker.rect, "bolus", manual)
            }}
            labels={drugLabels}
          />
        </AnchoredPopover>
      ) : null}
      {infusionPicker ? (
        <AnchoredPopover anchor={infusionPicker.rect} width={220} flipBelowSpace={320} onDismiss={closeInfusion}>
          <InfusionScenarioPicker
            favourites={favouriteInfusions}
            configs={infusionConfigs}
            visibleNames={visibleInfusionNames}
            hiddenNames={hiddenInfusionNames}
            displayItem={displayInfusionName}
            displayScenario={displayScenarioName}
            displayCategory={displayGroupName}
            onPick={(name, unit, manual) => {
              closeInfusion()
              onOpen(
                infusionPicker.ci,
                name,
                unit ?? infusionConfigs[name]?.units[0] ?? "mg/h",
                infusionPicker.rect,
                "infusion",
                manual,
              )
            }}
            labels={infusionLabels}
          />
        </AnchoredPopover>
      ) : null}
    </>
  )
}
