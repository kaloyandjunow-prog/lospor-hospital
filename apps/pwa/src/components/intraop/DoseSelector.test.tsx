import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/VitalStepper", () => ({ VitalStepper: () => null }))
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ language: "en", tc: (key: string) => key }),
}))
vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))

import { render } from "@/test/render"
import { DoseSelector } from "./DoseSelector"

function hasTestId(tree: ReturnType<typeof render>, testID: string) {
  return tree.root.findAllByProps({ testID }).length > 0
}

describe("DoseSelector operational controls", () => {
  it("confines paging presets to explicitly named fluid-volume operations", () => {
    const tree = render(
      <DoseSelector
        value="7"
        onValueChange={() => {}}
        min={0}
        max={20}
        operationalVolumePresets={[1, 2, 3, 4, 5, 6, 7]}
      />,
    )

    expect(hasTestId(tree, "volume-preset-0")).toBe(false)
    expect(hasTestId(tree, "volume-preset-5")).toBe(true)
    expect(hasTestId(tree, "volume-preset-6")).toBe(true)
  })

  it("pages concentrations four at a time while keeping Other available", () => {
    const onCustomConcentrationChange = vi.fn()
    const tree = render(
      <DoseSelector
        value="1"
        onValueChange={() => {}}
        min={0}
        max={20}
        concentrationOptions={["1", "2", "3", "4", "5", "6"]}
        onConcentrationChange={() => {}}
        onCustomConcentrationChange={onCustomConcentrationChange}
      />,
    )

    expect(hasTestId(tree, "concentration-pill-0")).toBe(true)
    expect(hasTestId(tree, "concentration-pill-4")).toBe(false)
    expect(hasTestId(tree, "concentration-other")).toBe(true)

    act(() => tree.root.findByProps({ testID: "concentration-page-next" }).props.onPress())

    expect(hasTestId(tree, "concentration-pill-0")).toBe(false)
    expect(hasTestId(tree, "concentration-pill-4")).toBe(true)
    expect(hasTestId(tree, "concentration-pill-5")).toBe(true)
    expect(hasTestId(tree, "concentration-other")).toBe(true)

    act(() => tree.root.findByProps({ testID: "concentration-other" }).props.onPress())
    expect(onCustomConcentrationChange).toHaveBeenCalledWith("")
  })

  it("deduplicates aliases and emits canonical wrapped routes", () => {
    const onRouteChange = vi.fn()
    const tree = render(
      <DoseSelector
        value="1"
        onValueChange={() => {}}
        min={0}
        max={20}
        routes={["PD", "EPIDURAL", "IV"]}
        route="IV"
        onRouteChange={onRouteChange}
      />,
    )

    const epiduralButtons = tree.root.findAllByProps({ testID: "dose-route-EPIDURAL" })
      .filter(node => typeof node.props.onPress === "function")
    // The RN test shim exposes both the composite and host instance for one
    // pressable; two instances therefore represent one logical route pill.
    expect(epiduralButtons).toHaveLength(2)
    expect(tree.root.findAllByProps({ testID: "dose-selector-routes" })[0].props.style).toMatchObject({
      flexWrap: "wrap",
    })

    act(() => epiduralButtons[0].props.onPress())
    expect(onRouteChange).toHaveBeenCalledWith("EPIDURAL")
  })
})
