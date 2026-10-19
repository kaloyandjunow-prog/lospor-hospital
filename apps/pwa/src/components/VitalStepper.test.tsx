import TestRenderer, { act } from "react-test-renderer"
import { Modal, Pressable } from "react-native"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/haptic", () => ({ hapticKey: () => {}, hapticTick: () => {} }))
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({
    t: (key: string) => ({ keypadLoweredToMax: "Lowered to the maximum, {value}.", keypadRaisedToMin: "Raised to the minimum, {value}." } as Record<string, string>)[key] ?? key,
  }),
}))

import { VitalStepper } from "./VitalStepper"

// A number typed beyond the limits is brought to the nearest one and the
// field says so (2026-10-18); strengths read 0.5, not 0.500.

function typed(text: string, props: Partial<React.ComponentProps<typeof VitalStepper>> = {}) {
  const onChange = vi.fn()
  let tree!: TestRenderer.ReactTestRenderer
  act(() => {
    tree = TestRenderer.create(<VitalStepper value={0.5} onChange={onChange} min={0.05} max={1} step={0.025} precision={3} unit="%" {...props} />,
      { createNodeMock: () => ({ measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 0, 120, 44) }) })
  })
  // The number itself opens the keypad.
  const field = tree.root.findAllByType(Pressable).find(node => node.findAllByProps({ children: "0.5" }).length > 0)!
  act(() => { field.props.onPress() })
  // The innermost button showing the key (the backdrop and panel wrap them all).
  const key = (k: string) => tree.root.findAllByType(Pressable).filter(node => node.findAllByProps({ children: k }).length > 0).at(-1)!
  // Clear what is there ("0.5"), then type.
  for (let i = 0; i < 3; i++) act(() => { key("back").props.onPress() })
  for (const k of text) act(() => { key(k).props.onPress() })
  act(() => { tree.root.findByType(Modal).props.onRequestClose() })
  return { tree, onChange }
}

const notice = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAllByProps({ testID: "stepper-limit-notice" }).map(node => node.props.children)[0]

describe("VitalStepper keypad limits", () => {
  it("lowers a number above the maximum to it, and says so", () => {
    const { tree, onChange } = typed("3")
    expect(onChange).toHaveBeenLastCalledWith(1)
    expect(notice(tree)).toBe("Lowered to the maximum, 1 %.")
  })

  it("raises a number below the minimum to it, and says so", () => {
    const { tree, onChange } = typed("0")
    expect(onChange).toHaveBeenLastCalledWith(0.05)
    expect(notice(tree)).toBe("Raised to the minimum, 0.05 %.")
  })

  it("says nothing for a number within the limits, and shows it without trailing zeros", () => {
    const { tree, onChange } = typed("0.15")
    expect(onChange).toHaveBeenLastCalledWith(0.15)
    expect(notice(tree)).toBeUndefined()
    expect(tree.root.findAllByProps({ children: "0.5" }).length).toBeGreaterThan(0)
  })
})
