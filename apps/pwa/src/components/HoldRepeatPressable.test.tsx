import { useState } from "react"
import TestRenderer, { act } from "react-test-renderer"
import { Pressable, Text } from "react-native"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/haptic", () => ({ hapticKey: () => {}, hapticTick: () => {} }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ t: (key: string) => key }) }))

import { HoldRepeatPressable } from "./HoldRepeatPressable"
import { VitalStepper } from "./VitalStepper"

// Holding + keeps counting up (2026-10-27). Before, the repeat reused the value
// from the moment the finger went down, so a hold set the same number again
// and again. A tap is one step; a scroll that starts on the button is none.

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function Stateful({ start }: { start: number }) {
  const [value, setValue] = useState<number | null>(start)
  return <>
    <VitalStepper value={value} onChange={setValue} min={0} max={300} step={1} />
    <Text testID="shown">{String(value)}</Text>
  </>
}

function plusOf(tree: TestRenderer.ReactTestRenderer) {
  return tree.root.findAllByType(HoldRepeatPressable).find(node => node.findAllByProps({ children: "+" }).length > 0)!.findByType(Pressable)
}
const shown = (tree: TestRenderer.ReactTestRenderer) => tree.root.findByProps({ testID: "shown" }).props.children

describe("holding + on a stepper", () => {
  it("keeps counting up from the latest value, faster after a while, and stops on release", () => {
    let tree!: TestRenderer.ReactTestRenderer
    act(() => { tree = TestRenderer.create(<Stateful start={80} />) })
    const plus = plusOf(tree)
    act(() => { plus.props.onPressIn?.({}) })
    act(() => { plus.props.onLongPress({}) })          // Pressable fires this at 420 ms
    expect(shown(tree)).toBe("81")
    for (let i = 0; i < 5; i++) act(() => { vi.advanceTimersByTime(120) })
    expect(shown(tree)).toBe("86")
    for (let i = 0; i < 40; i++) act(() => { vi.advanceTimersByTime(50) })
    const held = Number(shown(tree))
    expect(held).toBeGreaterThan(86 + 15)               // the 50 ms pace after 1.5 s
    act(() => { plus.props.onPressOut({}) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(Number(shown(tree))).toBe(held)
  })

  it("steps once on a tap and not at all when the press is only a touch-down (a scroll)", () => {
    let tree!: TestRenderer.ReactTestRenderer
    act(() => { tree = TestRenderer.create(<Stateful start={80} />) })
    const plus = plusOf(tree)
    act(() => { plus.props.onPressIn?.({}); plus.props.onPressOut({}) })
    expect(shown(tree)).toBe("80")
    act(() => { plus.props.onPress({}) })
    expect(shown(tree)).toBe("81")
  })
})

describe("HoldRepeatPressable", () => {
  it("waits 420 ms before a press counts as a hold, and keeps its label out of text selection", () => {
    const onStep = vi.fn()
    let tree!: TestRenderer.ReactTestRenderer
    act(() => { tree = TestRenderer.create(<HoldRepeatPressable onStep={onStep}><Text selectable={false}>+</Text></HoldRepeatPressable>) })
    expect(tree.root.findByType(Pressable).props.delayLongPress).toBe(420)
    expect(tree.root.findByType(Text).props.selectable).toBe(false)
  })
})
