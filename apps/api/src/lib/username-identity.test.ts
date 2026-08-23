import { describe, expect, it } from "vitest"
import {
  canonicalizeUsername,
  validateAndNormalizeUsername,
} from "./username-identity"

describe("Hospital username identity", () => {
  it.each([
    ["Clinician.One", "clinician.one"],
    ["A_1", "a_1"],
    ["head-of-dept", "head-of-dept"],
    ["MiXeD.Case_9", "mixed.case_9"],
  ])("preserves %s and derives only a lowercase comparison key", (username, canonical) => {
    expect(validateAndNormalizeUsername(username)).toEqual({
      success: true,
      value: { username, usernameCanonical: canonical },
    })
    expect(canonicalizeUsername(username)).toBe(canonical)
  })

  it.each([
    undefined,
    null,
    "",
    "Ab",
    "A".repeat(65),
    "1Doctor",
    " Doctor",
    "Doctor ",
    "Doctor Name",
    "Doctor@Hospital",
    "Doctor/One",
    "Doctor\\One",
    "Доктор",
    "Ｄoctor",
    "Doctor\u0000",
  ])("rejects non-contract username %j", value => {
    expect(validateAndNormalizeUsername(value).success).toBe(false)
  })
})
