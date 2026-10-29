import { describe, expect, it } from "vitest"
import { BROSELOW_ZONES, broselowLabel, broselowZone } from "./broselow"

const child = (heightCm?: number | null, weightKg?: number | null) => broselowZone({ clinicalMode: "PEDIATRIC", heightCm, weightKg })

describe("Broselow zones", () => {
  it("places a child by height, as the tape does", () => {
    expect(child(50)?.zone.key).toBe("GREY")
    expect(child(60)?.zone.key).toBe("PINK")
    expect(child(70)?.zone.key).toBe("RED")
    expect(child(80)?.zone.key).toBe("PURPLE")
    expect(child(90)?.zone.key).toBe("YELLOW")
    expect(child(100)?.zone.key).toBe("WHITE")
    expect(child(115)?.zone.key).toBe("BLUE")
    expect(child(125)?.zone.key).toBe("ORANGE")
    expect(child(135)?.zone.key).toBe("GREEN")
    expect(child(90)?.basis).toBe("HEIGHT")
  })

  it("puts a child exactly on a boundary in the larger zone, as the printed tape does", () => {
    expect(child(59.2)?.zone.key).toBe("PINK")
    expect(child(59.1)?.zone.key).toBe("GREY")
    expect(child(130.7)?.zone.key).toBe("GREEN")
  })

  it("uses weight only when there is no height", () => {
    expect(child(null, 13)?.zone.key).toBe("YELLOW")
    expect(child(null, 13)?.basis).toBe("WEIGHT")
    // Height decides when the two disagree.
    expect(child(100, 13)?.zone.key).toBe("WHITE")
  })

  it("has no gap in weight between zones, so a half kilo still lands", () => {
    expect(child(null, 5.5)?.zone.key).toBe("GREY")
    expect(child(null, 18.9)?.zone.key).toBe("WHITE")
    expect(child(null, 36.5)?.zone.key).toBe("GREEN")
  })

  it("does not apply outside the tape, to adults, or without a measurement", () => {
    expect(child(45)).toBeNull()
    expect(child(143.3)).toBeNull()
    expect(child(null, 2.5)).toBeNull()
    expect(child(null, 37)).toBeNull()
    expect(child(null, null)).toBeNull()
    expect(child(0, 0)).toBeNull()
    expect(broselowZone({ clinicalMode: "ADULT", heightCm: 100, weightKg: 15 })).toBeNull()
  })

  it("has contiguous bands and a Bulgarian name for every colour", () => {
    BROSELOW_ZONES.forEach((zone, index) => {
      expect(zone.labelBg.trim()).toBeTruthy()
      expect(zone.labelBg).not.toBe(zone.labelEn)
      if (index > 0) {
        expect(zone.minCm).toBe(BROSELOW_ZONES[index - 1].maxCm)
        expect(zone.minKg).toBe(BROSELOW_ZONES[index - 1].maxKg)
      }
    })
    expect(broselowLabel(BROSELOW_ZONES[0], "bg")).toBe("Сив")
    expect(broselowLabel(BROSELOW_ZONES[0], "en")).toBe("Grey")
  })
})
