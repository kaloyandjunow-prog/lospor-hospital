import { describe, expect, it } from "vitest"
import {
  RECENT_TECHNIQUES_MAX, TECHNIQUE_LEAVES, TCI_TECHNIQUE, addRecentTechniques, parseTechniqueSides, plannedTechniquesLeft, searchTechniques, setTechniqueSide,
  isPropofolTciModel, tciTechniqueForModel, techniqueAncestors, techniqueHasSide, techniqueSidesFor, techniquesAfterTciStart, techniquesMissingSide,
} from "./technique-smart"

describe("the side of a technique (10.2.0)", () => {
  it("peripheral blocks and the unilateral spinal take a side; general, neuraxial and the scalp block do not", () => {
    for (const code of ["BLOCK_FEMORAL", "BLOCK_ADDUCTOR", "BLOCK_TAP", "BLOCK_PERIBULBAR", "SPINAL_UNILATERAL"]) expect(techniqueHasSide(code)).toBe(true)
    for (const code of ["GENERAL_TIVA", "SPINAL_SINGLE_LUMBAR", "EPIDURAL_LUMBAR", "SEDATION_MAC", "BLOCK_SCALP", "PERIPHERAL", "NOT_A_CODE"]) expect(techniqueHasSide(code)).toBe(false)
  })

  it("reads a stored side map by dropping unknown techniques and sides", () => {
    expect(parseTechniqueSides({ BLOCK_FEMORAL: "LEFT", GENERAL_TIVA: "LEFT", BLOCK_SCIATIC: "UP", BLOCK_TAP: "BOTH" })).toEqual({ BLOCK_FEMORAL: "LEFT", BLOCK_TAP: "BOTH" })
    expect(parseTechniqueSides(null)).toEqual({})
    expect(parseTechniqueSides(["LEFT"])).toEqual({})
  })

  it("keeps a side only while its technique is on the list, and sets and clears one", () => {
    expect(techniqueSidesFor(["BLOCK_FEMORAL"], { BLOCK_FEMORAL: "LEFT", BLOCK_TAP: "RIGHT" })).toEqual({ BLOCK_FEMORAL: "LEFT" })
    expect(setTechniqueSide({}, "BLOCK_FEMORAL", "RIGHT")).toEqual({ BLOCK_FEMORAL: "RIGHT" })
    expect(setTechniqueSide({ BLOCK_FEMORAL: "RIGHT" }, "BLOCK_FEMORAL", null)).toEqual({})
    expect(setTechniqueSide({}, "GENERAL_TIVA", "LEFT")).toEqual({})
  })

  it("names the techniques that still need a side", () => {
    expect(techniquesMissingSide(["GENERAL_TIVA", "BLOCK_FEMORAL", "BLOCK_TAP"], { BLOCK_TAP: "BOTH" })).toEqual(["BLOCK_FEMORAL"])
  })
})

describe("finding a technique", () => {
  it("includes the unilateral spinal under Spinal", () => {
    expect(techniqueAncestors("SPINAL_UNILATERAL")).toEqual(["REGIONAL", "NEURAXIAL", "SPINAL"])
    expect(TECHNIQUE_LEAVES.some(hit => hit.code === "SPINAL_UNILATERAL")).toBe(true)
  })

  it("finds a technique by the start of a word, in English or Bulgarian, and ignores case", () => {
    expect(searchTechniques("fem")[0]?.code).toBe("BLOCK_FEMORAL")
    expect(searchTechniques("ADDUCTOR")[0]?.code).toBe("BLOCK_ADDUCTOR")
    expect(searchTechniques("тива").some(hit => hit.code === "GENERAL_TIVA")).toBe(true)
    expect(searchTechniques("TCI").some(hit => hit.code === "GENERAL_TCI")).toBe(true)
  })

  it("ranks a name that starts with the text before one that only contains it, and finds by family", () => {
    const femoral = searchTechniques("fem").map(hit => hit.code)
    expect(femoral[0]).toBe("BLOCK_FEMORAL")
    expect(femoral).toContain("BLOCK_LAT_FEMORAL")
    expect(searchTechniques("peripheral").length).toBeGreaterThan(5)
    expect(searchTechniques("")).toEqual([])
    expect(searchTechniques("zzzzzz")).toEqual([])
  })

  it("caps the number of results", () => {
    expect(searchTechniques("block", 3).length).toBeLessThanOrEqual(3)
  })
})

describe("the usual ones and the plan", () => {
  it("puts the latest used first, without repeats, capped, and drops what is not a technique", () => {
    expect(addRecentTechniques(["GENERAL_TIVA", "BLOCK_TAP"], ["BLOCK_TAP", "BLOCK_FEMORAL"])).toEqual(["BLOCK_FEMORAL", "BLOCK_TAP", "GENERAL_TIVA"])
    expect(addRecentTechniques([], ["NOPE", "GENERAL_TIVA", "GENERAL"])).toEqual(["GENERAL_TIVA"])
    const many = TECHNIQUE_LEAVES.slice(0, 20).map(hit => hit.code)
    expect(addRecentTechniques([], many)).toHaveLength(RECENT_TECHNIQUES_MAX)
  })

  it("lists the planned techniques not chosen yet", () => {
    expect(plannedTechniquesLeft(["GENERAL_TIVA", "BLOCK_ADDUCTOR", "NOPE"], ["GENERAL_TIVA"])).toEqual(["BLOCK_ADDUCTOR"])
  })
})

describe("TCI technique selection", () => {
  it("selects TCI for Propofol but not Remifentanil-only models", () => {
    expect(tciTechniqueForModel("MARSH")).toBe(TCI_TECHNIQUE)
    expect(tciTechniqueForModel("MINTO")).toBeNull()
    expect(isPropofolTciModel("MARSH")).toBe(true)
    expect(isPropofolTciModel("MINTO")).toBe(false)
  })

  it("does not select TCI for other drugs or unknown models", () => {
    expect(tciTechniqueForModel("GEPTS")).toBeNull()
    expect(tciTechniqueForModel("MAITRE")).toBeNull()
    expect(tciTechniqueForModel("not-a-model")).toBeNull()
  })

  it("adds the technique once and keeps existing techniques", () => {
    expect(techniquesAfterTciStart(["GENERAL_BALANCED"], "MARSH")).toEqual(["GENERAL_BALANCED", TCI_TECHNIQUE])
    expect(techniquesAfterTciStart(["GENERAL_BALANCED"], "MINTO")).toEqual(["GENERAL_BALANCED"])
  })
})
