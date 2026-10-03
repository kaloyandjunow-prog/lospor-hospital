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

  // These used to come out as the generic message (9.13.8).
  it("names what actually blocks finalization", () => {
    expect(finalizationErrorMessage({ reason: "missing_end_time" }, tc)).toBe("finalizeMissingEndTime")
    expect(finalizationErrorMessage({ reason: "missing_start_time" }, tc)).toBe("finalizeMissingStartTime")
    expect(finalizationErrorMessage({ reason: "entries_after_case_end" }, tc)).toBe("finalizeEntriesAfterEnd")
    expect(finalizationErrorMessage({ reason: "unconfirmed_stops" }, tc)).toBe("finalizeUnconfirmedStops")
    expect(finalizationErrorMessage({
      reason: "incomplete_preop",
      blockers: [{ code: "incomplete_preop", path: ["preop.airway"] }],
    }, tc)).toBe("finalizeIncompletePreop")
  })

  it("uses the generic localized fallback for unknown protocol responses", () => {
    expect(finalizationErrorMessage({ reason: "future_internal_protocol_code" }, tc)).toBe("couldFinaliseCase")
  })
})
