import { describe, expect, it } from "vitest"
import { classifyFinalizationError } from "./finalization-errors"

describe("classifyFinalizationError", () => {
  it("identifies incomplete demographics from the structured blocker path", () => {
    expect(classifyFinalizationError({
      reason: "incomplete_preop",
      blockers: [{ code: "incomplete_preop", path: ["preop.demographics"] }],
    })).toBe("missing_demographics")
  })

  it("says an existing assessment is incomplete, not missing, for any other section", () => {
    expect(classifyFinalizationError({
      reason: "incomplete_preop",
      blockers: [{ code: "incomplete_preop", path: ["preop.caseDetails"] }],
    })).toBe("incomplete_preop")
  })

  it.each([
    ["missing_technique", "missing_technique"],
    ["missing_postop", "missing_postop"],
    ["missing_aldrete", "missing_aldrete"],
    ["missing_disposition", "missing_disposition"],
    ["missing_intraop", "missing_intraop"],
    ["missing_preop", "missing_preop"],
    ["invalid_intraop_times", "invalid_intraop_times"],
    ["missing_start_time", "missing_start_time"],
    ["missing_end_time", "missing_end_time"],
    ["entries_after_case_end", "entries_after_case_end"],
    ["unconfirmed_stops", "unconfirmed_stops"],
  ] as const)("maps %s to a stable UI kind", (reason, expected) => {
    expect(classifyFinalizationError({ reason })).toBe(expected)
  })

  it("recognizes the API's already-finalized conflict", () => {
    expect(classifyFinalizationError({ code: "CASE_ALREADY_FINALISED" })).toBe("already_finalized")
  })

  // Every error the validator can raise has a message of its own (9.13.8);
  // four used to fall through to the generic "check all fields".
  it("has a kind for every reason case finalization can refuse with", async () => {
    const { evaluateCaseFinalization } = await import("./clinical-validation")
    const refusal = evaluateCaseFinalization({
      clinicalMode: "ADULT",
      preop: { id: "p" },
      intraop: { startTime: "08:00", keyEvents: { log: [] } },
      postop: {},
    })
    const reasons = [...new Set(refusal.issues.filter(i => i.severity === "error").map(i => i.code))]
    expect(reasons.length).toBeGreaterThan(3)
    for (const reason of reasons) {
      expect(classifyFinalizationError({ reason, blockers: [{ code: reason, path: ["preop.caseDetails"] }] }), reason).not.toBe("generic")
    }
  })

  it("never exposes an unknown reason as a UI message", () => {
    expect(classifyFinalizationError({ reason: "future_internal_protocol_code" })).toBe("generic")
    expect(classifyFinalizationError(null)).toBe("generic")
  })
})
