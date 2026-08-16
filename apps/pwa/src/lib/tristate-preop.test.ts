import { describe, expect, it } from "vitest"
import { preopFormSchema } from "./preop-form-schema"
import { valuesFromServerPreop } from "./preop-server-values"

/**
 * The chain that used to manufacture a "no".
 *
 * A clinician who never touched a question had it recorded as answered no, in
 * four separate places: the form schema defaulted it, the server hydration
 * coerced it, the API mapper coerced it again, and the column itself defaulted
 * it. Any one of them left in place puts the ambiguity back, and none of them
 * fails loudly -- the form simply shows a confident No that nobody chose.
 *
 * These cover the two links that live in this repo. The API mapper and the
 * column are pinned by tests in lospor-api.
 */
const field = (name: string) => preopFormSchema.shape[name as keyof typeof preopFormSchema.shape]

describe("an untouched clinical question stays unanswered", () => {
  it("defaults to null rather than false", () => {
    for (const name of ["smoking", "latexAllergy", "difficultAirwayHistory", "looseTeeth"]) {
      expect(field(name).parse(undefined), name).toBeNull()
    }
  })

  it("keeps a real answer of either kind", () => {
    // The negative control. Making every field null would pass the test above
    // while destroying the answers clinicians actually gave.
    expect(field("smoking").parse(false)).toBe(false)
    expect(field("smoking").parse(true)).toBe(true)
  })

  it("leaves the genuinely binary fields alone", () => {
    // Not every boolean is a question. Not emergent means elective, and not
    // high risk means not high risk -- there is no third state to record, so
    // these keep defaulting to false.
    expect(field("emergencySurgery").parse(undefined)).toBe(false)
    expect(field("highRiskSurgery").parse(undefined)).toBe(false)
  })
})

describe("reopening a saved case does not answer its blank questions", () => {
  it("carries null through from the server instead of coercing to false", () => {
    // valuesFromServerPreop hydrates the form from a saved assessment. It used to
    // coerce null to false here, so merely opening an old case and saving it
    // again would convert every unasked question into a documented no.
    const values = valuesFromServerPreop({ smoking: null, latexAllergy: true, dentalProsthetics: false } as never)
    expect(values.smoking).toBeNull()
    expect(values.latexAllergy).toBe(true)
    expect(values.dentalProsthetics).toBe(false)
  })
})
