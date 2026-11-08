import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key }) }))
vi.mock("react-native-svg", () => ({ __esModule: true, default: () => null, Circle: () => null, Path: () => null, Defs: () => null, G: () => null, Line: () => null, RadialGradient: () => null, Rect: () => null, Stop: () => null, Text: () => null }))

import { render } from "@/test/render"
import { DefibrillationSheet } from "./DefibrillationSheet"

const byId = (tree: ReturnType<typeof render>, id: string) => tree.root.findAll(node => node.props?.testID === id)[0]!
const readout = (tree: ReturnType<typeof render>) => byId(tree, "defib-readout").props.children

function sheet(prefillJoules: number | null, onSave = vi.fn()) {
  const tree = render(
    <DefibrillationSheet visible timeLabel="09:10" shockNumber={1} prefillJoules={prefillJoules} onClose={() => {}} onSave={onSave} />,
  )
  return { tree, onSave }
}

describe("the Defibrillation sheet", () => {
  it("starts empty for an adult and saves nothing until energy and synchronisation are both set", () => {
    const { tree, onSave } = sheet(null)
    expect(readout(tree)).toBe("—")
    act(() => { byId(tree, "defib-save").props.onPress() })
    expect(onSave).not.toHaveBeenCalled()
    act(() => { byId(tree, "defib-step-10").props.onPress() })
    act(() => { byId(tree, "defib-step-1").props.onPress() })
    expect(readout(tree)).toBe(11)
    act(() => { byId(tree, "defib-save").props.onPress() })
    expect(onSave).not.toHaveBeenCalled()
    act(() => { byId(tree, "defib-unsync").props.onPress() })
    act(() => { byId(tree, "defib-save").props.onPress() })
    expect(onSave).toHaveBeenCalledWith(11, false)
  })

  it("prefills a child's energy from the reference and says so, but never the synchronisation", () => {
    const { tree, onSave } = sheet(64)
    expect(readout(tree)).toBe(64)
    expect(byId(tree, "defib-prefill-hint")).toBeDefined()
    act(() => { byId(tree, "defib-save").props.onPress() })
    expect(onSave).not.toHaveBeenCalled()
    act(() => { byId(tree, "defib-sync").props.onPress() })
    act(() => { byId(tree, "defib-save").props.onPress() })
    expect(onSave).toHaveBeenCalledWith(64, true)
  })

  it("keeps the energy within 1 to 360 J", () => {
    const { tree } = sheet(355)
    for (let i = 0; i < 3; i += 1) act(() => { byId(tree, "defib-step-10").props.onPress() })
    expect(readout(tree)).toBe(360)
    const low = sheet(5).tree
    act(() => { byId(low, "defib-step--10").props.onPress() })
    expect(readout(low)).toBe(1)
  })
})
