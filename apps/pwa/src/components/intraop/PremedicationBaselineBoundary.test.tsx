import React from "react"
import { Text, TextInput, TouchableOpacity } from "react-native"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({
    language: "en",
    tc: (key: string) => key,
  }),
}))
vi.mock("@/lib/clinical-display", () => ({
  displayClinicalCode: (_category: string, value: string) => value,
}))

import { render } from "@/test/render"
import { PremedicationLibrarySheet } from "./PremedicationLibrarySheet"

const drug = {
  name: "Testazolam",
  dose: 20,
  unit: "mg",
  min: 0,
  max: 100,
  step: 5,
  routes: ["PO", "IV"],
  defaultRoute: "PO",
  hint: "OptionLibrary-derived dose",
}

const common = {
  visible: true,
  phase: "evening" as const,
  openCategory: null,
  dose: "",
  route: "PO",
  backLabel: "back",
  onClose: () => {},
  onToggleCategory: () => {},
  onBackToLibrary: () => {},
  onAdd: () => {},
  prospectiveGuidanceEnabled: false,
}

describe("PremedicationLibrarySheet baseline boundary", () => {
  it("keeps the medication selectable but clears its OptionLibrary dose", () => {
    const onSelectDrug = vi.fn()
    const onDoseChange = vi.fn()
    const tree = render(
      <PremedicationLibrarySheet
        {...common}
        categories={[{ category: "Sedation", drugs: [drug] }]}
        openCategory="Sedation"
        drug={null}
        onSelectDrug={onSelectDrug}
        onDoseChange={onDoseChange}
        onRouteChange={() => {}}
      />,
    )
    const medicationButton = tree.root.findAllByType(TouchableOpacity).find(button =>
      button.findAllByType(Text).some(text => text.props.children === drug.name),
    )

    medicationButton?.props.onPress()
    expect(onSelectDrug).toHaveBeenCalledWith(drug)
    expect(onDoseChange).toHaveBeenLastCalledWith("")
  })

  it("offers empty manual entry and clears it again when the route changes", () => {
    const onDoseChange = vi.fn()
    const onRouteChange = vi.fn()
    const tree = render(
      <PremedicationLibrarySheet
        {...common}
        categories={[]}
        drug={drug}
        onSelectDrug={() => {}}
        onDoseChange={onDoseChange}
        onRouteChange={onRouteChange}
      />,
    )

    expect(tree.root.findByType(TextInput).props.value).toBe("")
    expect(tree.root.findAllByType(Text).some(text => text.props.children === "+")).toBe(false)
    const ivButton = tree.root.findAllByType(TouchableOpacity).find(button =>
      button.findAllByType(Text).some(text => text.props.children === "IV"),
    )
    ivButton?.props.onPress()
    expect(onRouteChange).toHaveBeenCalledWith("IV")
    expect(onDoseChange).toHaveBeenLastCalledWith("")
  })
})
