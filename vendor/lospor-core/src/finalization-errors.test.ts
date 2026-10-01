import { describe, expect, it } from "vitest"
import { classifyFinalizationError } from "./finalization-errors"

describe("classifyFinalizationError", () => {
  it("identifies incomplete demographics from the structured blocker path", () => {
    expect(classifyFinalizationError({
      reason: "incomplete_preop",
      blockers: [{ code: "incomplete_preop", path: ["preop.demographics"] }],
    })).toBe("missing_demographics")
  })

  it("keeps other incomplete pre-op sections on the general pre-op message", () => {
    expect(classifyFinalizationError({
      reason: "incomplete_preop",
      blockers: [{ code: "incomplete_preop", path: ["preop.case_details"] }],
    })).toBe("missing_preop")
  })

  it.each([
    ["missing_technique", "missing_technique"],
    ["missing_postop", "missing_postop"],
    ["missing_aldrete", "missing_aldrete"],
    ["missing_disposition", "missing_disposition"],
    ["missing_intraop", "missing_intraop"],
    ["missing_preop", "missing_preop"],
    ["invalid_intraop_times", "invalid_intraop_times"],
  ] as const)("maps %s to a stable UI kind", (reason, expected) => {
    expect(classifyFinalizationError({ reason })).toBe(expected)
  })

  it("recognizes the API's already-finalized conflict", () => {
    expect(classifyFinalizationError({ code: "CASE_ALREADY_FINALISED" })).toBe("already_finalized")
  })

  it("never exposes an unknown reason as a UI message", () => {
    expect(classifyFinalizationError({ reason: "future_internal_protocol_code" })).toBe("generic")
    expect(classifyFinalizationError(null)).toBe("generic")
  })
})
