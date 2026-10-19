import React from "react"
import { describe, expect, it, vi } from "vitest"
import { act } from "react-test-renderer"
import { render } from "@/test/render"
import { CLINICAL_STRINGS } from "@/i18n/clinical-strings"
import { PlannedAnaesthesiaSection } from "./PlannedAnaesthesiaSection"

vi.mock("@/lib/use-option-library", () => ({ useOptionLibrary: () => ({ options: [] }) }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ language: "bg", tc: (key: string) => key }) }))

const tc = (key: string) => (CLINICAL_STRINGS.bg as Record<string, string>)[key] ?? key

describe("the planned anaesthesia on the PWA form", () => {
  it("keeps the rest of the plan when one part changes", () => {
    const onChange = vi.fn()
    const tree = render(<PlannedAnaesthesiaSection value={{ techniques: ["GENERAL_TIVA"], airwayDevices: ["LMA"] }} onChange={onChange} language="bg" tc={tc as never} />)
    act(() => { tree.root.find(node => node.props.testID === "preop-planned-ventilation" && typeof node.props.onValueChange === "function").props.onValueChange(true) })
    expect(onChange).toHaveBeenLastCalledWith({ techniques: ["GENERAL_TIVA"], airwayDevices: ["LMA"], airwayTools: [], vascularAccesses: [], postopVentilation: true })
    const shown = JSON.stringify(tree.toJSON())
    expect(shown).toContain("Планирана анестезия")
    expect(shown).toContain("Изкуствена белодробна вентилация след операцията")
  })
})
