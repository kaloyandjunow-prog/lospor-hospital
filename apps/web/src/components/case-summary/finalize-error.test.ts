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

  it("keeps other incomplete pre-op sections on the general pre-op message", () => {
    expect(finalizeErrorMessage({
      reason: "incomplete_preop",
      blockers: [{ code: "incomplete_preop", path: ["preop.case_details"] }],
    }, LABELS.bg)).toBe(LABELS.bg.finalizeMissingPreop)
  })

  it("does not expose an incomplete_preop protocol code as raw text", () => {
    expect(finalizeErrorMessage({ reason: "incomplete_preop" }, LABELS.en))
      .toBe(LABELS.en.finalizeMissingPreop)
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
