import { describe, expect, it } from "vitest"
import { adjacentIntraopTab, centeredTabRailScrollX, INTRAOP_TAB_KEYS, intraopTabSwipeDirection } from "./intraop-tabs"

describe("intraop tabs", () => {
  it("keeps the canonical tab order", () => {
    expect(INTRAOP_TAB_KEYS).toEqual([
      "equipment",
      "technique",
      "timing",
      "position",
      "monitoring",
      "airway",
      "vascular",
      "premedication",
      "log",
      "events",
    ])
  })

  it("moves to adjacent tabs and clamps at the ends", () => {
    expect(adjacentIntraopTab("equipment", -1)).toBe("equipment")
    expect(adjacentIntraopTab("equipment", 1)).toBe("technique")
    expect(adjacentIntraopTab("log", 1)).toBe("events")
    expect(adjacentIntraopTab("events", 1)).toBe("events")
    expect(adjacentIntraopTab("events", -1)).toBe("log")
  })

  it("centers the selected tab rail item and clamps at zero", () => {
    expect(centeredTabRailScrollX({ x: 20, width: 80 }, 200)).toBe(0)
    expect(centeredTabRailScrollX({ x: 220, width: 100 }, 200)).toBe(170)
  })

  it("detects only deliberate horizontal tab swipes", () => {
    expect(intraopTabSwipeDirection(-80, 10)).toBe(1)
    expect(intraopTabSwipeDirection(80, 10)).toBe(-1)
    expect(intraopTabSwipeDirection(40, 10)).toBeNull()
    expect(intraopTabSwipeDirection(80, 70)).toBeNull()
    expect(intraopTabSwipeDirection(20, 0)).toBeNull()
  })
})
