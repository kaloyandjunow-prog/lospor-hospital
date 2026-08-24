import { describe, expect, it } from "vitest"
import { legalDocumentUrl } from "./legal-links"

describe("legal document links", () => {
  it("keeps an appliance PWA on its own clinical origin", () => {
    expect(legalDocumentUrl("terms", "bg", {
      platform: "web",
      webOrigin: "https://lospor.hospital.example",
      configuredWebBase: "https://app.lospor.org",
    })).toBe("https://lospor.hospital.example/terms?locale=bg")
  })

  it("uses the configured Web origin for a native distribution", () => {
    expect(legalDocumentUrl("privacy", "en", {
      platform: "ios",
      webOrigin: null,
      configuredWebBase: "https://clinical.hospital.example/",
    })).toBe("https://clinical.hospital.example/privacy?locale=en")
  })
})
