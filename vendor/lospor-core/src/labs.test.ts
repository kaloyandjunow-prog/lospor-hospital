import { describe, expect, it } from "vitest"
import {
  LAB_LIBRARY,
  formatLabReferenceRange,
  getLabByName,
  getLabFlag,
  searchLabs,
} from "./labs"

describe("lab catalog", () => {
  it("contains unique named tests", () => {
    const names = LAB_LIBRARY.map(test => test.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("uses trimmed search and returns no rows for an empty query", () => {
    expect(searchLabs("   ")).toEqual([])
    expect(searchLabs("  creatinine ")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ test: expect.objectContaining({ name: "Creatinine" }) }),
      ]),
    )
  })

  it("looks up, flags and formats canonical ranges", () => {
    const creatinine = getLabByName("Creatinine")
    expect(creatinine).toBeDefined()
    expect(getLabFlag(creatinine!, 999)).toBe("high")
    expect(formatLabReferenceRange(creatinine!)).toBeTruthy()
  })
})
