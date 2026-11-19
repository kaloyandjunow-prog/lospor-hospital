import { describe, expect, it } from "vitest"
import { sliderLanding } from "./slider-step"

describe("where the slider lands", () => {
  it("lands on the coarser step", () => {
    expect(sliderLanding(12.34, 0.1, 0.5)).toBe(12.5)
    expect(sliderLanding(12.2, 0.1, 0.5)).toBe(12)
    expect(sliderLanding(0.24, 0.1, 0.5)).toBe(0)
    expect(sliderLanding(0.26, 0.1, 0.5)).toBe(0.5)
  })

  it("leaves the position to the usual rounding when there is no coarser step", () => {
    expect(sliderLanding(12.34, 0.1)).toBe(12.34)
    expect(sliderLanding(12.34, 0.5, 0.5)).toBe(12.34)
    expect(sliderLanding(12.34, 0.5, 0.1)).toBe(12.34)
  })
})
