import { describe, expect, it } from "vitest"
import {
  bundledColorHex,
  contrastRatio,
  DRUG_COLOR_PALETTE,
  drugColorTones,
  normalizeDrugColor,
  parseDrugColorMap,
  resolveDrugColor,
  readableTextColor,
  withIsoDrugColors,
} from "./drug-colors"
import { parseLibraryOption } from "./option-contracts"
import { shadeForSameGroupIn } from "./drug-colors-iso"

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
    // 10.8.0: with no colour of the hospital's, the ISO 26825 colour of the group.
    expect(resolveDrugColor(colors, "Antiemetics / prokinetics", "Ondansetron")).toBe("#fa8072")
    expect(resolveDrugColor(null, "Opioid analgesics", "Fentanyl")).toBe("#38bdf8")
    expect(resolveDrugColor(null, "Antimicrobials often given intraoperatively", "Cefazolin")).toBeNull()
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

describe("the ISO 26825 split of reversal and anticholinergics, and readable text", () => {
  const group = "Neuromuscular reversal / anticholinergics"
  it("gives the anticholinergics green and keeps the reversal agents in the group's red", () => {
    expect(resolveDrugColor(null, group, "Atropine")).toBe("#22c55e")
    expect(resolveDrugColor(null, group, "Glycopyrrolate")).toBe("#22c55e")
    expect(resolveDrugColor(null, group, "Scopolamine / Hyoscine")).toBe("#22c55e")
    expect(resolveDrugColor(null, group, "Neostigmine")).toBe("#f87171")
    expect(resolveDrugColor(null, group, "Sugammadex")).toBe("#f87171")
  })
  it("lets a hospital's own colour win, for the drug and for the group", () => {
    expect(resolveDrugColor({ groups: {}, drugs: { Atropine: "#111111" } }, group, "Atropine")).toBe("#111111")
    expect(resolveDrugColor({ groups: { [group]: "#222222" }, drugs: {} }, group, "Atropine")).toBe("#222222")
  })
  it("writes dark text on light colours and white on dark ones", () => {
    for (const light of ["#eab308", "#9ca3af", "#fa8072", "#38bdf8", "#22c55e", "#f59e0b"]) expect(readableTextColor(light)).toBe("#111827")
    for (const dark of ["#8b5cf6", "#ef4444", "#3b82f6", "#1e293b", "#4f46e5"]) expect(readableTextColor(dark)).toBe("#ffffff")
    expect(readableTextColor("blue")).toBe("#ffffff")
    expect(readableTextColor(null)).toBe("#ffffff")
  })
})

describe("shades of a group by theme", () => {
  it("lightens on the dark theme and darkens on the light one, and leaves the first as it is", () => {
    const channel = (hex: string) => Number.parseInt(hex.slice(1, 3), 16)
    expect(shadeForSameGroupIn("#808080", 0, "dark")).toBe("#808080")
    expect(channel(shadeForSameGroupIn("#808080", 1, "dark"))).toBeGreaterThan(0x80)
    expect(channel(shadeForSameGroupIn("#808080", 1, "light"))).toBeLessThan(0x80)
    expect(channel(shadeForSameGroupIn("#808080", 2, "dark"))).toBeGreaterThan(channel(shadeForSameGroupIn("#808080", 1, "dark")))
  })
})

describe("the bundled fallback carries the ISO colours", () => {
  it("gives drugs and infusions the colour of their group and leaves other categories and own colours alone", () => {
    const options = [
      { label: "Propofol", group: "Intravenous hypnotics / general anesthetics" },
      { label: "Atropine", group: "Neuromuscular reversal / anticholinergics" },
      { label: "Mystery", group: "Something else" },
      { label: "Fentanyl", group: "Opioid analgesics", customColor: "#123456" },
    ]
    const drugs = withIsoDrugColors("INTRAOP_DRUG", options)
    expect(drugs.map(option => (option as { customColor?: string }).customColor)).toEqual(["#eab308", "#22c55e", undefined, "#123456"])
    expect(withIsoDrugColors("INTRAOP_INFUSION", options)[0]).toMatchObject({ customColor: "#eab308" })
    expect(withIsoDrugColors("POSITION", options)).toBe(options)
  })
})
