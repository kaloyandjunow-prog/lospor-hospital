import { describe, expect, it } from "vitest"
import { ALDRETE_FIELDS } from "./postop"
import { evaluatePostopReadiness } from "./clinical-validation"

/**
 * The gate that decides a case may be finalised on its recovery assessment.
 *
 * Its own comment records why it is written the way it is: accepting a single
 * Aldrete subscore once let a partial assessment finalise, and the components
 * nobody had recorded were then counted as zero — documenting a patient who had
 * not been looked at as unresponsive and apnoeic, and exporting that to
 * research as fact. The rule is therefore *every* component or none.
 *
 * That makes two cases worth pinning, and they pull in opposite directions: an
 * absent component must block finalisation, and a component genuinely scored
 * zero must not. A falsy check satisfies the first and breaks the second, which
 * is exactly the mistake to guard against.
 */

function completePostop(overrides: Record<string, unknown> = {}) {
  return {
    aldreteActivity: 2,
    aldreteRespiration: 2,
    aldreteCirculation: 2,
    aldreteConsciousness: 2,
    aldreteSpO2: 2,
    disposition: "WARD",
    ...overrides,
  }
}

describe("evaluatePostopReadiness", () => {
  it("accepts a complete assessment with a disposition", () => {
    expect(evaluatePostopReadiness(completePostop())).toEqual({ valid: true, issues: [] })
  })

  it("rejects an absent postop section outright", () => {
    for (const absent of [null, undefined]) {
      const result = evaluatePostopReadiness(absent)
      expect(result.valid).toBe(false)
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: "missing_postop", path: ["postop"] }),
      )
    }
  })

  it("rejects the assessment when any single component is missing", () => {
    // One at a time: a rule that only catches an entirely empty score would pass
    // a four-of-five assessment, which is the case that caused the harm.
    for (const field of ALDRETE_FIELDS) {
      const result = evaluatePostopReadiness(completePostop({ [field]: null }))

      expect(result.valid, `${field} missing should block finalisation`).toBe(false)
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: "missing_aldrete", path: [`postop.${field}`] }),
      )
    }
  })

  it("treats a component scored zero as recorded, not as missing", () => {
    // Zero is a real Aldrete score — "no movement", "apnoeic". A clinician who
    // assessed the patient and found that must be able to finalise, and the
    // record must not claim the component was never looked at.
    const result = evaluatePostopReadiness(completePostop({
      aldreteActivity: 0,
      aldreteRespiration: 0,
    }))

    expect(result).toEqual({ valid: true, issues: [] })
  })

  it("requires a disposition", () => {
    const result = evaluatePostopReadiness(completePostop({ disposition: undefined }))

    expect(result.valid).toBe(false)
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "missing_disposition", path: ["postop.disposition"] }),
    )
  })

  it("reports the missing score and the missing disposition together", () => {
    const result = evaluatePostopReadiness({ disposition: undefined })

    expect(result.valid).toBe(false)
    expect(result.issues.map(item => item.code).sort())
      .toEqual(["missing_aldrete", "missing_disposition"])
  })

  it("raises every issue at error severity, so none is advisory", () => {
    const result = evaluatePostopReadiness({})

    expect(result.issues.length).toBeGreaterThan(0)
    for (const item of result.issues) expect(item.severity).toBe("error")
  })
})
