import { describe, expect, it } from "vitest"
import { claimsSideSwipe, sideSwipeExitMs, sideSwipeFade, sideSwipeFollow, sideSwipeGate, sideSwipeStep } from "./side-swipe"

// When a sideways swipe moves to the next preop section or intraop tab
// (10.0.0). A phone 412 px wide: 12% of it is 49 px.
const W = 412

describe("a sideways swipe", () => {
  it("is taken only after 14 px, and only when clearly sideways", () => {
    expect(claimsSideSwipe(-12, -4)).toBe(false) // the start of a thumb's arc
    expect(claimsSideSwipe(-30, -20)).toBe(false) // a slanted scroll
    expect(claimsSideSwipe(-30, -16)).toBe(false) // under twice as far across as down
    expect(claimsSideSwipe(-30, -10)).toBe(true)
  })

  it("changes the section after 12% of the width, either way", () => {
    expect(sideSwipeStep(-130, 10, 0.2, W)).toBe(1)
    expect(sideSwipeStep(130, 10, 0.2, W)).toBe(-1)
    expect(sideSwipeStep(-40, 10, 0.2, W)).toBeNull()
  })

  it("changes on a fast flick only if it also travelled 25 px", () => {
    expect(sideSwipeStep(-20, 2, -1.5, W)).toBeNull()
    expect(sideSwipeStep(-30, 5, -1.2, W)).toBe(1)
    // A flick back the other way is not a swipe forward.
    expect(sideSwipeStep(-40, 5, 1.2, W)).toBeNull()
  })

  it("does not change on a mostly vertical gesture, however far", () => {
    expect(sideSwipeStep(-150, -200, -1.5, W)).toBeNull()
  })

  it("moves the card only once claimed, then at nine tenths of the finger's pace", () => {
    expect(sideSwipeFollow(-10)).toBe(0)
    expect(sideSwipeFollow(-104)).toBeCloseTo(-81)
    expect(sideSwipeFollow(104)).toBeCloseTo(81)
  })

  it("leaves at the finger's speed, never in a jerk or a crawl", () => {
    expect(sideSwipeExitMs(300, 2)).toBe(150) // a fast flick: 300 px at 2 px/ms
    expect(sideSwipeExitMs(300, 0.1)).toBe(260) // a slow drag: capped
    expect(sideSwipeExitMs(60, 3)).toBe(140) // almost there: not instant
  })

  it("fades the card a little as it is dragged, never below 0.7", () => {
    expect(sideSwipeFade(0, W)).toBe(1)
    expect(sideSwipeFade(-W, W)).toBeCloseTo(0.7)
    expect(sideSwipeFade(-3 * W, W)).toBeCloseTo(0.7)
  })

  it("never turns a scroll sideways once it has gone up or down first", () => {
    const gate = sideSwipeGate()
    gate.start()
    expect(gate.claims(-2, -12)).toBe(false) // scrolling down
    expect(gate.claims(-60, -14)).toBe(false) // then drifting sideways: still a scroll
    // A new touch starts afresh.
    gate.start()
    expect(gate.claims(-30, -3)).toBe(true)
  })
})
