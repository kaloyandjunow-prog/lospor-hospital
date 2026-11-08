import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { parseIntraopAutomation } from "@lospor/core/intraop-automation"

const setAutomationGroups = vi.fn(async () => {})
const setEnergyKnobSkin = vi.fn(async () => {})
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key, t: (key: string) => key, automationGroups: { timers: false }, setAutomationGroups, energyKnobSkin: "A", setEnergyKnobSkin }),
}))
vi.mock("@/lib/use-intraop-automation", () => ({
  useIntraopAutomation: () => ({ settings: parseIntraopAutomation({ enabled: true, groups: { treatmentSuggestions: true, timers: true, reverseQuestions: false, readingQuestions: false, labQuestions: false, reminders: false } }), stats: null }),
}))
vi.mock("react-native-svg", () => ({ __esModule: true, default: () => null, Circle: () => null, Path: () => null, Defs: () => null, G: () => null, Line: () => null, RadialGradient: () => null, Rect: () => null, Stop: () => null, Text: () => null }))

import { render } from "@/test/render"
import { AutomationGroupsCard } from "./AutomationGroupsCard"
import { EnergyKnobSkinCard } from "./EnergyKnobSkinCard"

const byId = (tree: ReturnType<typeof render>, id: string) => tree.root.findAll(node => node.props?.testID === id)

describe("the clinician's suggestion settings on the phone (10.2.0)", () => {
  it("lists only the groups the hospital has on, and saves the whole set", () => {
    const tree = render(<AutomationGroupsCard />)
    expect(byId(tree, "setting-automation-treatmentSuggestions").length).toBeGreaterThan(0)
    expect(byId(tree, "setting-automation-labQuestions")).toHaveLength(0)
    expect(byId(tree, "setting-automation-timers")[0]!.props.value).toBe(false)
    act(() => { byId(tree, "setting-automation-treatmentSuggestions")[0]!.props.onValueChange(false) })
    expect(setAutomationGroups).toHaveBeenCalledWith({ timers: false, treatmentSuggestions: false })
  })

  it("offers the three knob skins as previews and saves the one picked", () => {
    const tree = render(<EnergyKnobSkinCard />)
    expect(byId(tree, "knob-preview-C").length).toBeGreaterThan(0)
    act(() => { byId(tree, "knob-pick-C")[0]!.props.onPress() })
    expect(setEnergyKnobSkin).toHaveBeenCalledWith("C")
  })
})
