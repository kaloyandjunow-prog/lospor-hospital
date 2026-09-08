import { describe, expect, it } from "vitest"
import { techniqueFamily } from "./intraop-domain"

describe("which family a technique belongs to", () => {
  it.each([
    ["GENERAL_INHALATION", "general"],
    ["GENERAL_TIVA", "general"],
    ["SPINAL", "neuraxial"],
    ["EPIDURAL_LUMBAR", "neuraxial"],
    ["CSE", "neuraxial"],
    ["DPE", "neuraxial"],
    ["BLOCK_FEMORAL", "block"],
    ["SEDATION_DEEP", "sedation"],
    ["LOCAL", "local"],
  ])("puts %s in the %s family", (technique, family) => {
    expect(techniqueFamily(technique)).toBe(family)
  })

  /**
   * These two are why this moved. The web app matched both prefixes and the
   * phone matched neither, so a peripheral block and a technique named as
   * neuraxial were coloured correctly on one client and dropped into the grey
   * "other" bucket on the other.
   */
  it.each([
    ["PERIPHERAL_NERVE_BLOCK", "block"],
    ["NEURAXIAL_COMBINED", "neuraxial"],
  ])("classifies %s as %s, which one client used to miss", (technique, family) => {
    expect(techniqueFamily(technique)).toBe(family)
  })

  // An unknown technique is grey rather than borrowed from a neighbour: a
  // regional block painted as a general anaesthetic reads as a different case.
  it("leaves an unrecognised technique unclassified", () => {
    expect(techniqueFamily("HYPNOSIS")).toBe("other")
    expect(techniqueFamily("")).toBe("other")
  })
})
