import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { render } from "@/test/render"
import { CLINICAL_STRINGS } from "@/i18n/clinical-strings"
import { PremedicationTab } from "./PremedicationTab"

vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ language: "en", tc: (key: string) => key }) }))

const tc = (key: string) => (CLINICAL_STRINGS.en as Record<string, string>)[key] ?? key
const ORDER = { DAY_BEFORE: "Midazolam 7.5 mg PO", MORNING: "Pantoprazole 40 mg PO" }

function tab(evening: string, morning: string) {
  const openPremedPicker = vi.fn()
  const tree = render(
    <PremedicationTab
      premedEveningText={evening} setPremedEveningText={() => {}}
      premedMorningText={morning} setPremedMorningText={() => {}}
      savePremedication={() => {}} tc={tc as never} openPremedPicker={openPremedPicker} ordered={ORDER}
    />,
  )
  const has = (testID: string) => tree.root.findAll(node => node.props.testID === testID).length > 0
  return { tree, openPremedPicker, has }
}

describe("the phone's premedication tab and the preop order", () => {
  it("says a phase still holds the order, with an edit button that opens the library", () => {
    const view = tab("Midazolam 7.5 mg PO", "Diazepam 5 mg PO")
    expect(view.has("premed-as-ordered-evening")).toBe(true)
    expect(view.has("premed-as-ordered-morning")).toBe(false)
    expect(JSON.stringify(view.tree.toJSON())).toContain("As ordered at the preop visit")
    act(() => { view.tree.root.find(node => node.props.testID === "premed-edit-ordered-evening" && node.props.onPress).props.onPress() })
    expect(view.openPremedPicker).toHaveBeenCalledWith("evening")
  })
})
