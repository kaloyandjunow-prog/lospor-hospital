import { describe, expect, it } from "vitest"
import { egnFieldIssue, nationalIdForCreate, validEgnOrNull } from "./egn-field"

// 7501010010 is checksum-valid; 2402459943 is the typo that produced
// "Invalid request" on the appliance (check digit should be 9).
describe("egnFieldIssue", () => {
  it("accepts an empty field and a valid ЕГН", () => {
    expect(egnFieldIssue("", false)).toBeNull()
    expect(egnFieldIssue("7501010010", false)).toBeNull()
    expect(egnFieldIssue(" 7501 010010 ", true)).toBeNull()
  })
  it("flags a wrong check digit as soon as the tenth digit is typed", () => {
    expect(egnFieldIssue("2402459943", false)).toBe("invalid")
  })
  it("flags letters and an eleventh digit at once", () => {
    expect(egnFieldIssue("75010a", false)).toBe("invalid")
    expect(egnFieldIssue("75010100101", false)).toBe("invalid")
  })
  it("flags an unfinished number only once the field is left", () => {
    expect(egnFieldIssue("750101", false)).toBeNull()
    expect(egnFieldIssue("750101", true)).toBe("incomplete")
  })
})

describe("nationalIdForCreate", () => {
  it("creates the case without a mistyped ЕГН and says so", () => {
    expect(nationalIdForCreate("2402459943")).toEqual({ send: undefined, dropped: true })
    expect(nationalIdForCreate("7501010010")).toEqual({ send: "7501010010", dropped: false })
    expect(nationalIdForCreate("  ")).toEqual({ send: undefined, dropped: false })
  })
})

describe("validEgnOrNull", () => {
  it("returns the digits of a valid ЕГН and null otherwise", () => {
    expect(validEgnOrNull("7501 010010")).toBe("7501010010")
    expect(validEgnOrNull("2402459943")).toBeNull()
    expect(validEgnOrNull("750101")).toBeNull()
    expect(validEgnOrNull("")).toBeNull()
  })
})
