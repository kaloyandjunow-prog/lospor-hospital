import { describe, expect, it } from "vitest"
import { legalDocumentUrl } from "./legal-links"

describe("legal document links", () => {
  it("keeps an appliance PWA on its own clinical origin", () => {
    // The appliance mounts this app at /app and the Web application at / on the
    // same host, so its own origin is right — and is the only right answer,
    // because the hospital's hostname cannot be known here. It configures no
    // web base, which is what makes this branch the one that runs.
    expect(legalDocumentUrl("terms", "bg", {
      platform: "web",
      webOrigin: "https://lospor.hospital.example",
      configuredWebBase: null,
    })).toBe("https://lospor.hospital.example/terms?locale=bg")
  })

  it("sends a PWA on its own origin to the configured Web application", () => {
    // The failure this shipped as. On the public deployment the PWA owns
    // pwa.lospor.org, which serves no legal pages, so a clinician tapping Terms
    // got a 404. A deployment saying where its Web application lives has to win
    // over the guess that it is wherever the app happens to be served from.
    expect(legalDocumentUrl("terms", "bg", {
      platform: "web",
      webOrigin: "https://pwa.lospor.org",
      configuredWebBase: "https://app.lospor.org",
    })).toBe("https://app.lospor.org/terms?locale=bg")
  })

  it("uses the configured Web origin for a native distribution", () => {
    expect(legalDocumentUrl("privacy", "en", {
      platform: "ios",
      webOrigin: null,
      configuredWebBase: "https://clinical.hospital.example/",
    })).toBe("https://clinical.hospital.example/privacy?locale=en")
  })

  it("falls back to the public Web application off the web with nothing configured", () => {
    expect(legalDocumentUrl("privacy", "en", {
      platform: "android",
      webOrigin: null,
      configuredWebBase: null,
    })).toBe("https://app.lospor.org/privacy?locale=en")
  })
})
