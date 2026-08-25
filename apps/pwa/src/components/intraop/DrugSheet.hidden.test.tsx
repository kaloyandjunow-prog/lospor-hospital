import React, { useState } from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/VitalStepper", () => ({ VitalStepper: () => null }))
vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ language: "en", tc: (key: string) => key }),
}))
vi.mock("@/lib/clinical-display", () => ({
  displayClinicalCode: (
    _category: string,
    value: string,
    _language: string,
    fallback?: { label?: string },
  ) => fallback?.label ?? value,
}))

import { pressByText, queryByText, render } from "@/test/render"
import type { DrugEntryDraft } from "@/lib/use-drug-entry"
import type { SearchOnlyMedicationOption } from "@/lib/hidden-clinical-options"
import { DrugSheet } from "./DrugSheet"

const cat = {
  cat: "Test drugs",
  color: "#3b82f6",
  drugs: [{ name: "Testacaine", unit: "mg" }],
}

const hidden: SearchOnlyMedicationOption = {
  name: "Hideamine",
  unit: "mg",
  color: "#ef4444",
  category: "Hidden test drugs",
  routes: ["IV", "IM"],
  rule: {
    key: "institution.hideamine",
    version: "9",
    sourceIds: ["source-hidden"],
    presetId: "institution-preset",
    presetVersion: 4,
    presetScope: "INSTITUTION",
  },
}

function Harness({ onSave }: { onSave: (draft: DrugEntryDraft) => void }) {
  const [draft, setDraft] = useState<DrugEntryDraft>({ pick: null, dose: "" })
  const [selectedCat, setSelectedCat] = useState<typeof cat | null>(null)
  return (
    <DrugSheet
      visible
      onClose={() => {}}
      drugCats={[cat]}
      searchOnlyDrugs={[hidden]}
      favouriteNames={[hidden.name]}
      scenarios={[{
        key: "hidden-scenario",
        label: "Hidden scenario",
        color: "#ef4444",
        items: [{ label: hidden.name, canonical: hidden.name }],
      }]}
      drugCat={selectedCat}
      setDrugCat={setSelectedCat}
      drugPick={draft.pick}
      setDrugPick={pick => setDraft(current => ({ ...current, pick }))}
      drugDose={draft.dose}
      setDrugDose={dose => setDraft(current => ({ ...current, dose }))}
      dosePresets={{}}
      drugRoute={draft.route}
      drugRule={draft.rule}
      applyDrugSelection={setDraft}
      routes={{ Hideamine: ["IV", "IM"] }}
      ranges={{ Hideamine: { min: 1, max: 2, step: 1 } }}
      routeProfiles={{
        Hideamine: {
          IM: {
            mode: "concentration",
            min: 1,
            max: 2,
            step: 1,
            quickValues: [1, 2],
            unit: "mg",
            concentrationOptions: ["forbidden concentration"],
            formulationOptions: ["ISOBARIC"],
          },
        },
      }}
      doseCalcs={{ Hideamine: { perKg: 2, hint: "forbidden dose source" } }}
      canStartAsInfusion
      onStartAsInfusion={() => {}}
      onConfirm={() => onSave(draft)}
    />
  )
}

describe("DrugSheet search-only hidden medication", () => {
  it("omits the drug from routine menus and opens it empty only after typed search", () => {
    const onSave = vi.fn<(draft: DrugEntryDraft) => void>()
    const tree = render(<Harness onSave={onSave} />)

    expect(queryByText(tree, "Hideamine")).toBeNull()
    expect(queryByText(tree, "Hidden scenario")).toBeNull()
    pressByText(tree, "dsFavourites")
    expect(queryByText(tree, "Hideamine")).toBeNull()
    pressByText(tree, "back")
    pressByText(tree, "dsBrowseAllDrugs")
    expect(queryByText(tree, "Hideamine")).toBeNull()

    act(() => tree.root.findByProps({ testID: "drug-search-input" }).props.onChangeText("Hide"))
    expect(queryByText(tree, "Hideamine")).not.toBeNull()
    expect(JSON.stringify(tree.toJSON())).toContain("dsSearchOnlyManualBadge")
    pressByText(tree, "Hideamine")

    expect(tree.root.findAllByProps({ testID: "drug-search-only-manual-notice" }).length).toBeGreaterThan(0)
    expect(tree.root.findAllByProps({ testID: "dose-manual-input" }).length).toBeGreaterThan(0)
    expect(tree.root.findAllByProps({ testID: "concentration-pill-0" })).toHaveLength(0)
    expect(tree.root.findAllByProps({ testID: "dose-formulation-ISOBARIC" })).toHaveLength(0)
    expect(queryByText(tree, "dsStartAsInfusion")).toBeNull()
    expect(JSON.stringify(tree.toJSON())).not.toContain("forbidden dose source")
    expect(JSON.stringify(tree.toJSON())).not.toContain("forbidden concentration")

    act(() => tree.root.findByProps({ testID: "dose-route-IM" }).props.onPress())
    act(() => tree.root.findByProps({ testID: "dose-manual-input" }).props.onChangeText("12"))
    act(() => tree.root.findByProps({ testID: "drug-sheet-confirm" }).props.onPress())

    expect(onSave).toHaveBeenCalledWith({
      pick: { name: "Hideamine", unit: "mg" },
      dose: "12",
      route: "IM",
      rule: {
        key: "institution.hideamine",
        version: "9",
        sourceIds: ["source-hidden"],
        presetId: "institution-preset",
        presetVersion: 4,
        presetScope: "INSTITUTION",
      },
    })
  })
})
