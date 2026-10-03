import { describe, expect, it } from "vitest"
import { LABELS } from "./labels"
import { finalizeErrorMessage } from "./finalize-error"

describe("finalization error messages", () => {
  it("names the incomplete pre-op demographics section", () => {
    expect(finalizeErrorMessage({
      reason: "incomplete_preop",
      blockers: [{ code: "incomplete_preop", path: ["preop.demographics"] }],
    }, LABELS.en)).toBe(LABELS.en.finalizeMissingDemographics)
  })

  it("says an existing assessment is incomplete rather than missing", () => {
    expect(finalizeErrorMessage({
      reason: "incomplete_preop",
      blockers: [{ code: "incomplete_preop", path: ["preop.caseDetails"] }],
    }, LABELS.bg)).toBe(LABELS.bg.finalizeIncompletePreop)
  })

  it("does not expose an incomplete_preop protocol code as raw text", () => {
    expect(finalizeErrorMessage({ reason: "incomplete_preop" }, LABELS.en))
      .toBe(LABELS.en.finalizeIncompletePreop)
  })

  // These four used to come out as the generic message (9.13.8).
  it.each([
    ["missing_end_time", "finalizeMissingEndTime"],
    ["missing_start_time", "finalizeMissingStartTime"],
    ["entries_after_case_end", "finalizeEntriesAfterEnd"],
    ["unconfirmed_stops", "finalizeUnconfirmedStops"],
  ] as const)("names what blocks finalization: %s", (reason, label) => {
    for (const locale of ["en", "bg"] as const) {
      expect(finalizeErrorMessage({ reason }, LABELS[locale])).toBe(LABELS[locale][label])
      expect(LABELS[locale][label]).not.toBe(LABELS[locale].finalizeFailed)
    }
  })

  it("maps an already-finalized conflict without exposing the protocol code", () => {
    expect(finalizeErrorMessage({ code: "CASE_ALREADY_FINALISED" }, LABELS.en))
      .toBe(LABELS.en.finalizeAlreadyFinalized)
  })

  it("uses the safe generic message for an unknown server reason", () => {
    expect(finalizeErrorMessage({ reason: "future_internal_protocol_code" }, LABELS.en))
      .toBe(LABELS.en.finalizeFailed)
  })
})
