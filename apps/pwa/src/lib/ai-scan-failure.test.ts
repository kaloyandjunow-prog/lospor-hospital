import { describe, expect, it } from "vitest"
import { aiScanFailureKey, isConsentRefusal } from "./ai-scan-failure"

// Found on the appliance: every failed scan read "the image could not be read",
// so a case without AI consent looked like a bad photo.
describe("the message for a failed scan", () => {
  it("names the missing consent", () => {
    const refusal = { status: 403, message: "AI advice not enabled for this case" }
    expect(aiScanFailureKey(refusal, "lspScanFailedMsg")).toBe("aiScanNeedsConsent")
    expect(isConsentRefusal(refusal)).toBe(true)
  })

  it("keeps a different 403 on the caller's wording", () => {
    expect(aiScanFailureKey({ status: 403, message: "Forbidden" }, "lspScanFailedMsg")).toBe("lspScanFailedMsg")
    expect(isConsentRefusal({ status: 403, message: "Forbidden" })).toBe(false)
  })

  it("names size, type, rate, model, set-up, timeout and connection", () => {
    expect(aiScanFailureKey({ status: 413 }, "lspScanFailedMsg")).toBe("aiScanImageTooLarge")
    expect(aiScanFailureKey({ status: 400 }, "lspScanFailedMsg")).toBe("aiScanImageFormat")
    expect(aiScanFailureKey({ status: 429 }, "lspScanFailedMsg")).toBe("aiScanTooMany")
    expect(aiScanFailureKey({ status: 503, code: "EXTERNAL_AI_MODEL_UNAVAILABLE" }, "lspScanFailedMsg")).toBe("aiScanModelUnavailable")
    expect(aiScanFailureKey({ status: 503, code: "NOT_CONFIGURED" }, "lspScanFailedMsg")).toBe("aiScanNotConfigured")
    expect(aiScanFailureKey({ status: 504 }, "lspScanFailedMsg")).toBe("aiScanTimeout")
    expect(aiScanFailureKey({ status: 0, code: "NETWORK" }, "lspScanFailedMsg")).toBe("aiScanOffline")
  })

  it("falls back for anything else, a thrown non-error included", () => {
    expect(aiScanFailureKey({ status: 500 }, "monitorScanFailedMsg")).toBe("monitorScanFailedMsg")
    expect(aiScanFailureKey(new Error("boom"), "lspScanFailedMsg")).toBe("lspScanFailedMsg")
    expect(aiScanFailureKey(undefined, "lspScanFailedMsg")).toBe("lspScanFailedMsg")
  })
})
