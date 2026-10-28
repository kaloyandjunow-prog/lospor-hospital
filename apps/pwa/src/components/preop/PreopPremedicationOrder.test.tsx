import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { render } from "@/test/render"
import { CLINICAL_STRINGS } from "@/i18n/clinical-strings"
import { PreopPremedicationOrderSection } from "./PreopPremedicationOrder"

// The premedication order on the phone (1.7.0): the intraop library sheet, the
// same doses, written into the phase in the intraop record's own words.

const MIDAZOLAM = { name: "Midazolam", dose: 7.5, unit: "mg", min: 1, max: 15, step: 0.5, routes: ["PO"], defaultRoute: "PO", hint: "" }

vi.mock("@/lib/use-option-library", () => ({ useOptionLibrary: () => ({ options: [] }) }))
vi.mock("@/lib/intraop-option-mappers", () => ({ mapPremedicationCategories: () => [{ category: "Anxiolytics", drugs: [MIDAZOLAM] }] }))
vi.mock("@/lib/pediatric-clinical-rules", () => ({ useClinicalRules: () => ({ prospectiveGuidanceEnabled: true }) }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ language: "en", tc: (key: string) => key }) }))
vi.mock("@/components/intraop/PremedicationLibrarySheet", () => ({ PremedicationLibrarySheet: () => null }))

const tc = (key: string) => (CLINICAL_STRINGS.en as Record<string, string>)[key] ?? key

function section(value: Record<string, string>) {
  const onChange = vi.fn()
  const tree = render(<PreopPremedicationOrderSection value={value} onChange={onChange} patient={{ clinicalMode: "ADULT", weightKg: 80 }} language="en" tc={tc as never} />)
  const press = (testID: string) => act(() => { tree.root.find(node => node.props.testID === testID && typeof node.props.onPress === "function").props.onPress() })
  const sheet = () => tree.root.findAll(node => typeof node.props.onSelectDrug === "function")[0]?.props
  return { tree, onChange, press, sheet }
}

describe("the premedication order on the phone", () => {
  it("adds a drug from the library to the phase it was opened for", () => {
    const view = section({ DAY_BEFORE: "", MORNING: "Pantoprazole 40 mg PO" })
    expect(view.sheet()).toBeUndefined()
    view.press("preop-premedication-add-morning")
    act(() => { view.sheet().onSelectDrug(MIDAZOLAM) })
    act(() => { view.sheet().onAdd() })
    expect(view.onChange).toHaveBeenLastCalledWith({ DAY_BEFORE: "", MORNING: "Pantoprazole 40 mg PO; Midazolam 7.5 mg PO" })
  })

  it("removes one drug and keeps the rest", () => {
    const view = section({ DAY_BEFORE: "Midazolam 7.5 mg PO; Paracetamol 1000 mg PO", MORNING: "" })
    view.press("preop-premedication-remove-evening-Midazolam 7.5 mg PO")
    expect(view.onChange).toHaveBeenLastCalledWith({ DAY_BEFORE: "Paracetamol 1000 mg PO", MORNING: "" })
  })

  it("names the two phases", () => {
    const shown = JSON.stringify(section({}).tree.toJSON())
    expect(shown).toContain("The night before surgery")
    expect(shown).toContain("The morning of surgery")
  })
})
