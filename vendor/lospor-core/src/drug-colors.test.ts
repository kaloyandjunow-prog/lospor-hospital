import { describe, expect, it } from "vitest"
import {
  bundledColorHex,
  contrastRatio,
  DRUG_COLOR_PALETTE,
  drugColorTones,
  normalizeDrugColor,
  parseDrugColorMap,
  resolveDrugColor,
} from "./drug-colors"
import { parseLibraryOption } from "./option-contracts"

describe("drug colours", () => {
  it("offers 32 distinct colours, each named in both languages", () => {
    expect(DRUG_COLOR_PALETTE).toHaveLength(32)
    expect(new Set(DRUG_COLOR_PALETTE.map(color => color.hex)).size).toBe(32)
    for (const color of DRUG_COLOR_PALETTE) {
      expect(normalizeDrugColor(color.hex)).toBe(color.hex)
      expect(color.labelEn).not.toBe("")
      expect(color.labelBg).not.toBe("")
    }
  })

  it("draws any colour readably in both themes, a free one included", () => {
    const free = ["#ffff99", "#ffffff", "#000000", "#00ff00", "#0000ff", "#fdf6e3"]
    for (const hex of [...DRUG_COLOR_PALETTE.map(color => color.hex), ...free]) {
      const { light, dark } = drugColorTones(hex)
      expect(contrastRatio(light.text, light.bg), `${hex} light`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(dark.text, dark.bg), `${hex} dark`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(light.solid, "#ffffff"), `${hex} light solid`).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(dark.solid, "#1a1a1a"), `${hex} dark solid`).toBeGreaterThanOrEqual(3)
    }
  })

  it("keeps a colour that is already readable as it is", () => {
    expect(drugColorTones("#ef4444").dark.solid).toBe("#ef4444")
  })

  it("takes the drug's own colour over its group's", () => {
    const colors = { groups: { "Opioid analgesics": "#f97316" }, drugs: { Remifentanil: "#ec4899" } }
    expect(resolveDrugColor(colors, "Opioid analgesics", "Remifentanil")).toBe("#ec4899")
    expect(resolveDrugColor(colors, "Opioid analgesics", "Fentanyl")).toBe("#f97316")
    expect(resolveDrugColor(colors, "Antiemetics / prokinetics", "Ondansetron")).toBeNull()
    expect(resolveDrugColor(null, "Opioid analgesics", "Fentanyl")).toBeNull()
  })

  it("stores only #rrggbb", () => {
    expect(normalizeDrugColor("#ABC")).toBe("#aabbcc")
    expect(normalizeDrugColor(" #A1B2C3 ")).toBe("#a1b2c3")
    expect(normalizeDrugColor("red")).toBeNull()
    expect(normalizeDrugColor("#12345")).toBeNull()
    expect(parseDrugColorMap({ groups: { A: "#123456", B: "nope" }, drugs: [] })).toEqual({ groups: { A: "#123456" }, drugs: {} })
  })

  it("reads a bundled colour as a plain value", () => {
    expect(bundledColorHex("bg-blue-100 text-blue-700 dark:bg-blue-500/15")).toBe("#3b82f6")
    expect(bundledColorHex("#8B5CF6")).toBe("#8b5cf6")
    expect(bundledColorHex(null)).toBeNull()
  })

  it("carries the hospital colour through the option contract", () => {
    const base = { id: "1", value: "FENTANYL", label: "Fentanyl" }
    expect(parseLibraryOption({ ...base, customColor: "#EC4899" })?.customColor).toBe("#ec4899")
    expect(parseLibraryOption({ ...base, customColor: "pink" })).not.toHaveProperty("customColor")
    expect(parseLibraryOption(base)).not.toHaveProperty("customColor")
    expect(parseLibraryOption({ ...base, customGroupColor: "#3b82f6" })?.customGroupColor).toBe("#3b82f6")
  })
})
