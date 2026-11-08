// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { GestureGuard } from "./GestureGuard"

// While a slider is dragged or a button held, the page can select nothing.

const held = () => document.documentElement.getAttribute("data-gesture") === "held"

function selectStart(): boolean {
  const event = new Event("selectstart", { cancelable: true, bubbles: true })
  document.body.dispatchEvent(event)
  return event.defaultPrevented
}

function setup() {
  return render(
    <div>
      <GestureGuard />
      <input type="range" aria-label="slider" />
      <button type="button">+</button>
      <p>some text</p>
    </div>,
  )
}

describe("GestureGuard", () => {
  it("marks the page and cancels text selection while a slider is held", () => {
    const view = setup()
    const slider = view.getByLabelText("slider")
    expect(held()).toBe(false)
    expect(selectStart()).toBe(false)
    fireEvent.pointerDown(slider)
    expect(held()).toBe(true)
    expect(selectStart()).toBe(true)
    fireEvent.pointerUp(window)
    expect(held()).toBe(false)
    expect(selectStart()).toBe(false)
  })

  it("does the same for a button held down, and lets go when the pointer is cancelled", () => {
    const view = setup()
    fireEvent.pointerDown(view.getByRole("button"))
    expect(held()).toBe(true)
    fireEvent.pointerCancel(window)
    expect(held()).toBe(false)
  })

  it("leaves plain text alone: pressing on it does not lock selection", () => {
    const view = setup()
    fireEvent.pointerDown(view.getByText("some text"))
    expect(held()).toBe(false)
    expect(selectStart()).toBe(false)
  })

  it("lets go when the page is left", () => {
    const view = setup()
    fireEvent.pointerDown(view.getByRole("button"))
    view.unmount()
    expect(held()).toBe(false)
  })
})
