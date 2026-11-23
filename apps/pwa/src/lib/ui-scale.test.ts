import { describe, expect, it } from "vitest"
import { parseUiScale, viewportContent } from "./ui-scale"

describe("the display size (10.0.0)", () => {
  it("keeps a stored value on the slider's steps and within its range", () => {
    expect(parseUiScale("120")).toBe(120)
    expect(parseUiScale("122")).toBe(120)
    expect(parseUiScale("400")).toBe(150)
    expect(parseUiScale("5")).toBe(80)
    expect(parseUiScale(null)).toBe(100)
  })

  it("lays the page out for the window's width over the factor, whatever the screen's width is", () => {
    // 412 px wide at 130%: laid out for 317 px and drawn larger, never for the monitor's 1920.
    expect(viewportContent(412, 130)).toBe("width=317, initial-scale=1.3, minimum-scale=1.3, maximum-scale=1.3, shrink-to-fit=no")
    expect(viewportContent(412, 100)).toBe("width=device-width, initial-scale=1, shrink-to-fit=no")
  })
})
