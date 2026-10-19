import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("expo-secure-store", () => ({}))

import { aiScanFailureKey } from "./ai-scan-failure"
import { ApiError } from "./api"
import { serverMessage, setServerMessageLanguage } from "./server-message"

afterEach(() => setServerMessageLanguage("en"))

describe("server messages in the app's language", () => {
  it("shows an API error in Bulgarian and keeps the English it came as", () => {
    setServerMessageLanguage("bg")
    const error = new ApiError("Case is finalised", 409)
    expect(error.message).toBe("Случаят е приключен")
    expect(error.sourceMessage).toBe("Case is finalised")
  })

  it("leaves English readers' messages alone", () => {
    expect(new ApiError("Case is finalised", 409).message).toBe("Case is finalised")
    expect(serverMessage("Local save failed")).toBe("Local save failed")
  })

  it("still recognises a missing AI consent in Bulgarian", () => {
    setServerMessageLanguage("bg")
    const error = new ApiError("AI advice not enabled for this case", 403)
    expect(aiScanFailureKey(error, "lspScanFailedMsg")).toBe("aiScanNeedsConsent")
  })
})
