import { describe, expect, it } from "vitest"
import { createGestureHandle, gestureHeld, holdGesture } from "./gesture-lock"
import { sideSwipeGate } from "./side-swipe"

describe("the gesture lock", () => {
  it("is held from the first touch to the last release, however many controls hold it", () => {
    expect(gestureHeld()).toBe(false)
    const first = holdGesture()
    const second = holdGesture()
    expect(gestureHeld()).toBe(true)
    first()
    expect(gestureHeld()).toBe(true)
    second()
    expect(gestureHeld()).toBe(false)
  })

  it("lets a release be reported twice without freeing someone else's hold", () => {
    const mine = holdGesture()
    const theirs = holdGesture()
    mine()
    mine()
    expect(gestureHeld()).toBe(true)
    theirs()
    expect(gestureHeld()).toBe(false)
  })

  it("a control's handle holds once however often it starts, and frees on end", () => {
    const handle = createGestureHandle()
    handle.start()
    handle.start()
    expect(gestureHeld()).toBe(true)
    handle.end()
    expect(gestureHeld()).toBe(false)
    handle.end()
    expect(gestureHeld()).toBe(false)
  })
})

describe("the side swipe while a control is held", () => {
  it("claims a clear sideways swipe when nothing is held", () => {
    const gate = sideSwipeGate()
    gate.start()
    expect(gate.claims(60, 4)).toBe(true)
  })

  it("never claims, however far across the finger has gone, while a slider has it", () => {
    const gate = sideSwipeGate()
    gate.start()
    const release = holdGesture()
    expect(gate.claims(40, 0)).toBe(false)
    expect(gate.claims(400, 2)).toBe(false)
    release()
    // The same gesture is a swipe again only once the control lets go.
    expect(gate.claims(400, 2)).toBe(true)
  })
})
