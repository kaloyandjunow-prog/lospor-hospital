// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest"
import { render, fireEvent, screen } from "@testing-library/react"
import { HoldRepeatButton } from "./HoldRepeatButton"

// Press and hold on a touch screen: keeps stepping, and the browser's own
// long-press gestures (text selection, the context/callout menu) are kept off.

beforeAll(() => {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>
  if (!proto.setPointerCapture) proto.setPointerCapture = () => {}
})
afterEach(() => { vi.useRealTimers() })

function setup() {
  const onStep = vi.fn()
  render(<HoldRepeatButton onStep={onStep} className="">+</HoldRepeatButton>)
  return { onStep, button: screen.getByRole("button") }
}

describe("HoldRepeatButton", () => {
  it("steps once on a tap", () => {
    const { onStep, button } = setup()
    fireEvent.pointerDown(button, { button: 0 })
    fireEvent.pointerUp(button)
    fireEvent.click(button, { detail: 1 })
    expect(onStep).toHaveBeenCalledTimes(1)
  })

  it("keeps stepping while held, faster after a while, and stops on release", () => {
    vi.useFakeTimers()
    const { onStep, button } = setup()
    fireEvent.pointerDown(button, { button: 0 })
    vi.advanceTimersByTime(399)
    expect(onStep).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1 + 120 * 5)       // 400 ms, then every 120 ms
    expect(onStep).toHaveBeenCalledTimes(6)
    vi.advanceTimersByTime(1500 - 600 + 500)  // every 50 ms after 1.5 s more
    const fast = onStep.mock.calls.length
    expect(fast).toBeGreaterThanOrEqual(6 + 7 + 10)
    fireEvent.pointerUp(button)
    vi.advanceTimersByTime(2000)
    expect(onStep).toHaveBeenCalledTimes(fast)
  })

  it("stops when the browser takes the pointer away", () => {
    vi.useFakeTimers()
    const { onStep, button } = setup()
    fireEvent.pointerDown(button, { button: 0 })
    fireEvent.pointerCancel(button)
    vi.advanceTimersByTime(2000)
    expect(onStep).toHaveBeenCalledTimes(1)
  })

  it("keeps the long press from selecting text or opening the browser menu", () => {
    const { button } = setup()
    expect(fireEvent.pointerDown(button, { button: 0 })).toBe(false) // default prevented
    fireEvent.pointerUp(button)
    expect(fireEvent.contextMenu(button)).toBe(false)
    expect(button.className).toContain("select-none")
    expect(button.className).toContain("[-webkit-touch-callout:none]")
  })

  it("still steps from the keyboard", () => {
    const { onStep, button } = setup()
    fireEvent.click(button, { detail: 0 })
    expect(onStep).toHaveBeenCalledTimes(1)
  })
})
