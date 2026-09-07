import { describe, expect, it } from "vitest"
import { strictFiniteNumber } from "./strict-number"

describe("strictFiniteNumber", () => {
  it("accepts a genuine number", () => {
    expect(strictFiniteNumber(70)).toBe(70)
    expect(strictFiniteNumber("70")).toBe(70)
    expect(strictFiniteNumber("70.5")).toBe(70.5)
    expect(strictFiniteNumber("-3.2e2")).toBe(-320)
  })

  /**
   * The exact failure this exists to prevent: parseFloat/Number both stop at
   * the first character that breaks the pattern and hand back what they
   * already read, silently manufacturing a plausible number from text that
   * was never purely numeric.
   */
  it("rejects a number with trailing text, rather than truncating it", () => {
    expect(strictFiniteNumber("70kg")).toBeNull()
    expect(strictFiniteNumber("70junk")).toBeNull()
    expect(strictFiniteNumber("5.2 (H)")).toBeNull()
  })

  it("rejects text with no number in it at all", () => {
    expect(strictFiniteNumber("negative")).toBeNull()
    expect(strictFiniteNumber("")).toBeNull()
  })

  it("rejects non-finite numbers", () => {
    expect(strictFiniteNumber(NaN)).toBeNull()
    expect(strictFiniteNumber(Infinity)).toBeNull()
  })

  it("tolerates null and undefined without throwing", () => {
    expect(strictFiniteNumber(null)).toBeNull()
    expect(strictFiniteNumber(undefined)).toBeNull()
  })
})
