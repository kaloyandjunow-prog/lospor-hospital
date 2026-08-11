import { describe, expect, it } from "vitest"
import { fitPopoverWidth, positionPopover, type PositionPopoverInput } from "./anchored-position"

/**
 * A popover that lands off-screen is not a cosmetic problem on this screen: the
 * button underneath it is how a drug gets recorded, and an anaesthetist with
 * gloved hands is not going to scroll a fixed-position panel back into view.
 */

function input(overrides: Partial<PositionPopoverInput> = {}): PositionPopoverInput {
  return {
    anchor: { top: 300, bottom: 340, left: 400, right: 440, width: 40 },
    width: 240,
    viewport: { width: 1280, height: 800 },
    flipBelowSpace: 300,
    ...overrides,
  }
}

describe("positionPopover", () => {
  it("hangs below the anchor when there is room", () => {
    const placement = positionPopover(input())
    expect(placement.showAbove).toBe(false)
    expect(placement.top).toBe(344)
    expect(placement.left).toBe(400)
  })

  it("flips above when the space below is too small", () => {
    // 800 - 700 = 100 of room, against a 300 requirement.
    const placement = positionPopover(input({
      anchor: { top: 660, bottom: 700, left: 400, right: 440, width: 40 },
    }))
    expect(placement.showAbove).toBe(true)
    expect(placement.top).toBe(656)
  })

  it("pulls back from the right edge instead of overflowing it", () => {
    const placement = positionPopover(input({
      anchor: { top: 300, bottom: 340, left: 1200, right: 1240, width: 40 },
    }))
    // 1280 - 240 - 8
    expect(placement.left).toBe(1032)
  })

  it("never starts left of the margin, even on a narrow screen", () => {
    // The panel is wider than the viewport; it must still start on-screen.
    const placement = positionPopover(input({
      viewport: { width: 200, height: 800 },
      anchor: { top: 300, bottom: 340, left: 10, right: 50, width: 40 },
    }))
    expect(placement.left).toBe(8)
  })

  it("centres on the anchor when asked, and still respects the edges", () => {
    expect(positionPopover(input({ align: "center" })).left).toBe(400 + 20 - 120)
    expect(positionPopover(input({
      align: "center",
      anchor: { top: 300, bottom: 340, left: 0, right: 40, width: 40 },
    })).left).toBe(8)
  })

  it("treats the threshold as the boundary it reads as", () => {
    // Exactly the required space is enough; one pixel less is not.
    expect(positionPopover(input({
      anchor: { top: 460, bottom: 500, left: 400, right: 440, width: 40 },
    })).showAbove).toBe(false)
    expect(positionPopover(input({
      anchor: { top: 461, bottom: 501, left: 400, right: 440, width: 40 },
    })).showAbove).toBe(true)
  })
})

describe("belowGap", () => {
  const anchor = { top: 200, bottom: 230, left: 100, right: 180, width: 80 }
  const viewport = { width: 1280, height: 800 }

  it("hangs the panel a few pixels under the anchor by default", () => {
    expect(positionPopover({ anchor, width: 220, viewport, flipBelowSpace: 260 }).top).toBe(234)
  })

  it("honours a wider gap when one is asked for", () => {
    // The dosing flyout sits 6px below rather than 4px; it is the one caller
    // that differs, and the difference is preserved rather than normalised.
    expect(positionPopover({ anchor, width: 220, viewport, flipBelowSpace: 260, belowGap: 6 }).top)
      .toBe(236)
  })

  it("ignores the gap when the panel flips above", () => {
    expect(positionPopover({ anchor, width: 220, viewport, flipBelowSpace: 900, belowGap: 6 }).top)
      .toBe(196)
  })
})

describe("fitPopoverWidth", () => {
  it("keeps the preferred width when it fits", () => {
    expect(fitPopoverWidth(300, 1280)).toBe(300)
  })

  it("still fits when the viewport is only just wide enough", () => {
    expect(fitPopoverWidth(300, 320)).toBe(300)
  })

  it("shrinks to the viewport on a narrow screen", () => {
    expect(fitPopoverWidth(300, 250)).toBe(234)
  })

  it("stops shrinking at a width still usable with a thumb", () => {
    expect(fitPopoverWidth(300, 120)).toBe(180)
  })
})
