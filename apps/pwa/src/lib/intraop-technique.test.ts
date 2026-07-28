import { describe, expect, it } from "vitest"
import type { LibraryOption } from "@/lib/use-option-library"
import { buildTechniqueTree, techniqueColor, techniqueDisplayLabel, techniqueValuePath } from "./intraop-technique"

const row = (id: string, value: string, label: string, parentId: string | null): LibraryOption =>
  ({ id, value, label, parentId }) as unknown as LibraryOption

describe("buildTechniqueTree", () => {
  it("nests children under their parent and leaves leaves childless", () => {
    const tree = buildTechniqueTree([
      row("1", "GENERAL", "General anaesthesia", null),
      row("2", "GENERAL_TIVA", "TIVA", "1"),
      row("3", "REGIONAL", "Regional", null),
    ])
    expect(tree.map(n => n.v)).toEqual(["GENERAL", "REGIONAL"])
    expect(tree[0].children?.map(c => c.v)).toEqual(["GENERAL_TIVA"])
    expect(tree[1].children).toBeUndefined()
  })
})

describe("techniqueDisplayLabel", () => {
  it("builds compact category-aware labels", () => {
    const tree = buildTechniqueTree([
      row("general", "GENERAL", "General anaesthesia", null),
      row("general-inhalation", "GENERAL_INHALATION", "Inhalational", "general"),
      row("regional", "REGIONAL", "Regional anaesthesia", null),
      row("peripheral", "BLOCK", "Peripheral nerve block", "regional"),
      row("upper", "BLOCK_UPPER", "Upper extremity", "peripheral"),
      row("interscalene", "BLOCK_INTERSCALENE", "Interscalene", "upper"),
      row("spinal", "SPINAL_SINGLE_SHOT", "Spinal (SAB)", "regional"),
    ])

    expect(techniqueValuePath("BLOCK_INTERSCALENE", tree)).toEqual([
      "Regional anaesthesia",
      "Peripheral nerve block",
      "Upper extremity",
      "Interscalene",
    ])
    expect(techniqueDisplayLabel("GENERAL_INHALATION", tree)).toBe("General Inhalational")
    expect(techniqueDisplayLabel("BLOCK_INTERSCALENE", tree)).toBe("Regional Interscalene")
    expect(techniqueDisplayLabel("SPINAL_SINGLE_SHOT", tree)).toBe("Regional Spinal")
  })

  it("handles custom and unknown values", () => {
    expect(techniqueDisplayLabel("OTHER:Awake fiberoptic", [])).toBe("Awake fiberoptic")
    expect(techniqueDisplayLabel("UNKNOWN", [])).toBe("UNKNOWN")
  })
})

describe("techniqueColor", () => {
  it("maps technique families to colours", () => {
    expect(techniqueColor("GENERAL_TIVA")).toBe("#8b5cf6")
    expect(techniqueColor("SPINAL_SINGLE_LUMBAR")).toBe("#3b82f6")
    expect(techniqueColor("CSE_LUMBAR")).toBe("#3b82f6")
    expect(techniqueColor("DPE")).toBe("#3b82f6")
    expect(techniqueColor("BLOCK_TAP")).toBe("#22c55e")
    expect(techniqueColor("SEDATION_MAC")).toBe("#f59e0b")
    expect(techniqueColor("LOCAL")).toBe("#f43f5e")
    expect(techniqueColor("OTHER")).toBe("#64748b")
  })
})
