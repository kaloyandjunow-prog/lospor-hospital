import TestRenderer, { act } from "react-test-renderer"
import { Text, TouchableOpacity } from "react-native"
import { describe, expect, it, vi } from "vitest"
import { FLACC_ITEMS, PAED_ITEMS } from "@lospor/core/postop-pain"
import { ItemScale, ScaleTotal, SelfReportScale } from "./PainScales"

// Pain and delirium are entered item by item, with no slider (10.0.0).

function render(node: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer
  act(() => { tree = TestRenderer.create(node) })
  return tree
}

describe("the pain scales", () => {
  it("scores a FLACC item with the points its answer carries, and clears on a second tap", () => {
    const onChange = vi.fn()
    const tree = render(<ItemScale items={FLACC_ITEMS} values={{ flaccCry: 2 }} onChange={onChange} language="en" testID="flacc" />)
    const buttons = tree.root.findAllByType(TouchableOpacity)
    expect(buttons).toHaveLength(15) // five behaviours, three answers each
    act(() => { buttons[1].props.onPress() }) // Face: 1
    expect(onChange).toHaveBeenLastCalledWith("flaccFace", 1)
    act(() => { buttons[11].props.onPress() }) // Cry: 2, already chosen
    expect(onChange).toHaveBeenLastCalledWith("flaccCry", null)
  })

  it("gives PAED's first item its reverse points", () => {
    const onChange = vi.fn()
    const tree = render(<ItemScale items={PAED_ITEMS} values={{}} onChange={onChange} language="bg" testID="paed" />)
    act(() => { tree.root.findAllByType(TouchableOpacity)[0].props.onPress() }) // "not at all" making eye contact
    expect(onChange).toHaveBeenLastCalledWith("paedEyeContact", 4)
  })

  it("offers FPS-R only its six faces", () => {
    const onChange = vi.fn()
    const tree = render(<SelfReportScale kind="FPS_R" value={null} onChange={onChange} lowLabel="none" highLabel="worst" />)
    const labels = tree.root.findAllByType(TouchableOpacity).map(button => button.props.accessibilityLabel)
    expect(labels).toEqual(["FPS-R 0", "FPS-R 2", "FPS-R 4", "FPS-R 6", "FPS-R 8", "FPS-R 10"])
  })

  it("shows no total until every item is scored", () => {
    const tree = render(<ScaleTotal label="FLACC" total={null} max={10} language="en" notComplete="Not every item scored" />)
    const shown = tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(""))
    expect(shown).toContain("Not every item scored")
    expect(shown.some(text => text.startsWith("—"))).toBe(true)
  })
})
