import { describe, expect, it } from "vitest"
import { parseUiScale, uiScaleFontSize } from "./ui-scale"

describe("the display size (10.0.0)", () => {
  it("keeps a stored value on the slider's steps and within its range", () => {
    expect(parseUiScale("115")).toBe(115)
    expect(parseUiScale("117")).toBe(115)
    expect(parseUiScale("300")).toBe(150)
    expect(parseUiScale("10")).toBe(80)
    expect(parseUiScale("big")).toBe(100)
    expect(parseUiScale(undefined)).toBe(100)
  })

  it("leaves the root font size alone at 100%", () => {
    expect(uiScaleFontSize(100)).toBeUndefined()
    expect(uiScaleFontSize(130)).toBe("130%")
  })
})
