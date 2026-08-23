import { describe, expect, it } from "vitest"
import {
  capabilityMessageKey,
  parseAuthenticationCapabilities,
  parseClinicalAiCapabilities,
} from "./deployment-capabilities"

describe("Hospital PWA deployment capability parsing", () => {
  it("accepts enabled, disabled, and unconfigured capability states", () => {
    expect(parseClinicalAiCapabilities({ features: { clinicalAi: {
      clinicalAdvice: { enabled: true, reason: "ENABLED" },
      labImageExtraction: { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" },
      monitorOcr: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
    } } })).toEqual({
      clinicalAdvice: { enabled: true, reason: "ENABLED" },
      labImageExtraction: { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" },
      monitorOcr: { enabled: false, reason: "PROVIDER_NOT_CONFIGURED" },
    })
  })

  it.each([null, {}, { features: {} }, { features: { clinicalAi: {
    clinicalAdvice: { enabled: true, reason: "unexpected" },
  } } }])("fails closed for missing or malformed input", value => {
    expect(Object.values(parseClinicalAiCapabilities(value)).every(item => !item.enabled)).toBe(true)
  })

  it("uses distinct Bulgarian/English message keys for policy and credentials", () => {
    expect(capabilityMessageKey("DISABLED_BY_DEPLOYMENT")).toBe("externalAiDisabledDeployment")
    expect(capabilityMessageKey("PROVIDER_NOT_CONFIGURED")).toBe("externalAiProviderUnavailable")
  })

  it("accepts the exact Hospital username policy", () => {
    expect(parseAuthenticationCapabilities({ authentication: {
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    } })).toEqual({
      status: "EXPLICIT",
      loginIdentifier: "USERNAME",
      selfRegistration: false,
      passwordRecovery: "ADMINISTRATOR",
    })
  })

  it.each([
    null,
    {},
    { authentication: { loginIdentifier: "USERNAME", selfRegistration: true, passwordRecovery: "ADMINISTRATOR" } },
    { authentication: { loginIdentifier: "USERNAME", selfRegistration: false, passwordRecovery: "EMAIL" } },
    { authentication: { loginIdentifier: "HANDLE", selfRegistration: false, passwordRecovery: "ADMINISTRATOR" } },
  ])("fails an absent or contradictory authentication contract closed", value => {
    expect(parseAuthenticationCapabilities(value).status).toBe("INVALID_CONTRACT")
  })
})
