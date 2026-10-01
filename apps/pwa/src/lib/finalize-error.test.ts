import { describe, expect, it } from "vitest"
import { finalizationErrorMessage } from "./finalize-error"

const tc = (key: string) => key

describe("PWA finalization error messages", () => {
  it("explains incomplete demographics", () => {
    expect(finalizationErrorMessage({
      reason: "incomplete_preop",
      blockers: [{ code: "incomplete_preop", path: ["preop.demographics"] }],
    }, tc)).toBe("finalizeMissingDemographics")
  })

  it("maps the other finalization blockers", () => {
    expect(finalizationErrorMessage({ reason: "missing_postop" }, tc)).toBe("finalizeMissingPostop")
    expect(finalizationErrorMessage({ reason: "invalid_intraop_times" }, tc)).toBe("finalizeInvalidTimes")
    expect(finalizationErrorMessage({ code: "CASE_ALREADY_FINALISED" }, tc)).toBe("finalizeAlreadyFinalized")
  })

  it("uses the generic localized fallback for unknown protocol responses", () => {
    expect(finalizationErrorMessage({ reason: "future_internal_protocol_code" }, tc)).toBe("couldFinaliseCase")
  })
})
