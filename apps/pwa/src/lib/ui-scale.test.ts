import { describe, expect, it } from "vitest"
import { parseUiScale } from "./ui-scale"

describe("the display size (10.0.0)", () => {
  it("keeps a stored value on the slider's steps and within its range", () => {
    expect(parseUiScale("120")).toBe(120)
    expect(parseUiScale("122")).toBe(120)
    expect(parseUiScale("400")).toBe(150)
    expect(parseUiScale("5")).toBe(80)
    expect(parseUiScale(null)).toBe(100)
  })
})
