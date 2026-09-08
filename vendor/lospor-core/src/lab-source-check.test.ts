import { describe, expect, it } from "vitest"
import { labSourceDiffers, type ScannedLabResult } from "./labs"

function scanned(over: Partial<ScannedLabResult> = {}): ScannedLabResult {
  return { test: "Glucose", value: "4.1", unit: "mmol/L", ...over }
}

/**
 * Whether the review screen must show the clinician what the paper said.
 *
 * One client showed this and the other received the same fields and rendered
 * only the converted number, so on the phone a glucose read off a photograph
 * and multiplied by a factor appeared with nothing to check it against.
 */
describe("whether a scanned result still matches its report", () => {
  it("flags a converted value so the arithmetic can be checked", () => {
    expect(labSourceDiffers(scanned({ sourceValue: "74", sourceUnit: "mg/dL" }))).toBe(true)
  })

  it("flags a unit relabelled without the number changing", () => {
    expect(labSourceDiffers(scanned({ sourceValue: "4.1", sourceUnit: "mmol/l" }))).toBe(true)
  })

  it("stays quiet when the report already read in the stored unit", () => {
    expect(labSourceDiffers(scanned({ sourceValue: "4.1", sourceUnit: "mmol/L" }))).toBe(false)
  })

  /**
   * A hand-typed result has no report behind it. Showing "report printed:"
   * with nothing after it would invite a clinician to check the entry against
   * a document that does not exist.
   */
  it("stays quiet for a result nobody scanned", () => {
    expect(labSourceDiffers(scanned())).toBe(false)
  })

  // The stored value is text and the report's is text; a number that survived
  // the conversion unchanged is the same number.
  it("compares the values as written, not as parsed", () => {
    expect(labSourceDiffers(scanned({ value: "4.1", sourceValue: "4.10", sourceUnit: "mmol/L" })))
      .toBe(true)
  })

  // A report with no unit against a stored unit is a change worth showing.
  it("treats a missing source unit as different from a stored one", () => {
    expect(labSourceDiffers(scanned({ sourceValue: "4.1" }))).toBe(true)
  })
})
