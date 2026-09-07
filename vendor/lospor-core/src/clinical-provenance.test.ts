import { describe, expect, it } from "vitest"

import {
  carryProvenance,
  hasProvenance,
  provenanceFromRule,
} from "./clinical-provenance"

/**
 * The provenance is what makes a recorded dose auditable rather than a bare
 * number. It was written out by hand at nine call sites across the web and
 * mobile timetables and five more in this package, which is how one field
 * eventually gets carried at eight of them and dropped at the ninth — silently,
 * because the dose still records either way.
 */
describe("provenance minted from a clinical rule", () => {
  it("names the rule that sized the dose", () => {
    expect(provenanceFromRule({
      key: "propofol-adult-induction", version: "3", sourceIds: ["bnf-2026"],
    })).toMatchObject({
      clinicalRuleKey: "propofol-adult-induction",
      clinicalRuleVersion: "3",
      clinicalRuleSourceIds: ["bnf-2026"],
    })
  })

  it("carries a complete preset", () => {
    expect(provenanceFromRule({
      key: "r", presetId: "p1", presetVersion: 3, presetScope: "INSTITUTION",
    })).toMatchObject({
      clinicalPresetId: "p1",
      clinicalPresetVersion: 3,
      clinicalPresetScope: "INSTITUTION",
    })
  })

  /**
   * A preset id with no version cannot be resolved back to what was applied.
   * An unresolvable reference is worse than none: it reads as an answer.
   */
  it("drops a half-recorded preset, and keeps the rule", () => {
    const provenance = provenanceFromRule({ key: "r", presetId: "p1" })

    expect(provenance.clinicalPresetId).toBeUndefined()
    expect(provenance.clinicalRuleKey).toBe("r")
  })

  it("treats no rule as no provenance", () => {
    expect(hasProvenance(provenanceFromRule(null))).toBe(false)
  })
})

describe("provenance carried from an existing entry", () => {
  /**
   * The rule that applied when the dose was given is the fact being recorded.
   * Re-deriving it from whichever rule applies now would rewrite history on a
   * duplicate, which is the one thing an audit field must not do.
   */
  it("copies what is there, unchanged", () => {
    const entry = {
      name: "Propofol", dose: "200",
      clinicalRuleKey: "old-rule", clinicalPresetVersion: 2,
    }

    expect(carryProvenance(entry)).toMatchObject({
      clinicalRuleKey: "old-rule",
      clinicalPresetVersion: 2,
    })
  })

  it("does not bring anything that is not provenance", () => {
    const carried = carryProvenance({ name: "Propofol", dose: "200", clinicalRuleKey: "r" })
    expect(carried).not.toHaveProperty("name")
    expect(carried).not.toHaveProperty("dose")
  })

  // Same shape every time: a missing key and an undefined one read alike in
  // memory and differently through JSON, and these travel through JSON.
  it("keeps every key, set or not", () => {
    expect(Object.keys(carryProvenance({ clinicalRuleKey: "r" })).sort()).toEqual([
      "clinicalPresetId",
      "clinicalPresetScope",
      "clinicalPresetVersion",
      "clinicalRuleKey",
      "clinicalRuleSourceIds",
      "clinicalRuleVersion",
    ])
  })
})
