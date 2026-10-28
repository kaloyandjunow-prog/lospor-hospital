import { describe, expect, it } from "vitest"
import { drugColorTones } from "@lospor/core/drug-colors"
import { drugChip, drugSolid } from "./drug-tone"

describe("a hospital's drug colour on the web (10.0.0)", () => {
  it("keeps the bundled classes when the hospital chose no colour", () => {
    expect(drugChip("bg-blue-100 text-blue-700", undefined)).toEqual({ className: "bg-blue-100 text-blue-700" })
  })

  it("draws a chosen colour through both themes' readable tones", () => {
    const chip = drugChip("bg-blue-100 text-blue-700", "#eab308")
    const tones = drugColorTones("#eab308")
    expect(chip.className).toBe("drug-tone")
    expect(chip.style).toMatchObject({ "--tone-text": tones.light.text, "--tone-text-dark": tones.dark.text, "--tone-bg-dark": tones.dark.bg })
  })

  it("darkens a pale colour for bars on the light theme only", () => {
    expect(drugSolid("#ffff99", false)).not.toBe("#ffff99")
    expect(drugSolid("#ffff99", true)).toBe("#ffff99")
  })
})
