import { describe, expect, it } from "vitest"
import { discloseResearchCount } from "@lospor/core/research"
import { formatOptionalResearchCount, formatResearchCount } from "./research-disclosure"

describe("research count disclosure formatting", () => {
  it.each([
    [0, "0"],
    [1, "1-4"],
    [4, "1-4"],
    [5, "5-9"],
    [17, "10-19"],
    [126, "100-149"],
  ])("formats protected count %i as %s", (count, expected) => {
    expect(formatResearchCount(discloseResearchCount(count))).toBe(expected)
  })

  it("uses an exact value only when policy returned or supplied one", () => {
    const protectedCount = discloseResearchCount(4)
    expect(formatOptionalResearchCount(null, protectedCount)).toBe("1-4")
    expect(formatOptionalResearchCount(4, discloseResearchCount(4, true))).toBe("4")
  })

  it("formats an open-ended protected range", () => {
    expect(formatResearchCount({ value: null, lowerBound: 1000, upperBound: null, exact: false, suppressed: false }))
      .toBe("1000+")
  })
})
