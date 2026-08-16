import { describe, expect, it } from "vitest"
import { schema as preopSchema } from "@/components/forms/preopSchema"
import { dbPostopToForm, dbPreopToForm } from "@/app/(app)/cases/new/case-record-mapping"

/**
 * The chain that used to manufacture a "no".
 *
 * A clinician who never touched a question had it recorded as answered no, in
 * four separate places: the form schema defaulted it, the record hydration
 * coerced it, the API mapper coerced it again, and the column itself defaulted
 * it. Any one of them left in place puts the ambiguity back, and none of them
 * fails loudly -- the form simply shows a confident No that nobody chose.
 */
const field = (name: string) =>
  (preopSchema as unknown as { shape: Record<string, { parse: (v: unknown) => unknown }> }).shape[name]

describe("an untouched clinical question stays unanswered", () => {
  it("defaults to null rather than false", () => {
    for (const name of ["smoking", "latexAllergy", "difficultAirwayHistory", "rcriCHF", "stopbangNeck", "povocHistory"]) {
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
    // Not every boolean is a question. Not emergent means elective and not high
    // risk means not high risk, so there is no third state to record. The same
    // goes for the unobtainable ticks and the monitoring/equipment flags: those
    // are marks a clinician makes, not questions put to a patient.
    expect(field("highRiskSurgery").parse(undefined)).toBe(false)
    expect(field("emergencySurgery").parse(undefined)).toBe(false)
    expect(field("bpUnobtainable").parse(undefined)).toBe(false)
    expect(field("airwayUnobtainable").parse(undefined)).toBe(false)
  })
})

describe("reopening a saved case does not answer its blank questions", () => {
  it("carries null through from the record instead of coercing to false", () => {
    // This hydrates the form from a saved case. It used to coerce null to
    // false, so merely opening an old case and letting it autosave converted
    // every unasked question into a documented no.
    const values = dbPreopToForm({
      smoking: null,
      latexAllergy: true,
      looseTeeth: false,
      rcriCHF: null,
      povocHistory: null,
    } as never)
    expect(values.smoking).toBeNull()
    expect(values.rcriCHF).toBeNull()
    expect(values.povocHistory).toBeNull()
    expect(values.latexAllergy).toBe(true)
    expect(values.looseTeeth).toBe(false)
  })

  it("still fills the genuinely binary fields", () => {
    const values = dbPreopToForm({ highRiskSurgery: null, bpUnobtainable: null } as never)
    expect(values.highRiskSurgery).toBe(false)
    expect(values.bpUnobtainable).toBe(false)
  })

  it("treats postoperative nausea the same way", () => {
    // PONV is the one tri-state question outside the preop form, and it has its
    // own hydration path, so it can regress independently of everything above.
    expect(dbPostopToForm({ ponv: null } as never).ponv).toBeNull()
    expect(dbPostopToForm({ ponv: false } as never).ponv).toBe(false)
    expect(dbPostopToForm({ ponv: true } as never).ponv).toBe(true)
    // Its neighbours in the same form are ticks, not questions.
    expect(dbPostopToForm({ recoveryBpUnobtainable: null } as never).recoveryBpUnobtainable).toBe(false)
  })
})
