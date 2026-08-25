import { afterEach, describe, expect, it, vi } from "vitest"
import {
  capabilityMessageKey,
  clearPediatricModeCapabilityCache,
  loadPediatricModeCapability,
  parseClinicalAiCapabilities,
  parsePediatricModeCapability,
  pediatricCapabilityMessageKey,
} from "./deployment-capabilities"

const pediatricCapability = {
  enabled: true,
  productionReady: true,
  rulesetVersion: "2026.08.04-release.1",
  minimumClientVersion: "8.0.0",
  reviewedDoseProfilesRequired: true,
}

describe("deployment capability parsing", () => {
  afterEach(() => {
    clearPediatricModeCapabilityCache()
    vi.restoreAllMocks()
  })

  it("accepts only the exact machine-readable capability contract", () => {
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

  it("distinguishes deployment policy from provider availability", () => {
    expect(capabilityMessageKey("DISABLED_BY_DEPLOYMENT")).toBe("deploymentCapabilities.externalAiDisabled")
    expect(capabilityMessageKey("PROVIDER_NOT_CONFIGURED")).toBe("deploymentCapabilities.externalAiUnavailable")
  })

  it("enables Pediatric selection only for the complete reviewed contract", () => {
    expect(parsePediatricModeCapability({
      features: { pediatricMode: pediatricCapability },
    })).toEqual({
      enabled: true,
      reason: "ENABLED",
      productionReady: true,
      rulesetVersion: "2026.08.04-release.1",
      minimumClientVersion: "8.0.0",
      reviewedDoseProfilesRequired: true,
    })
  })

  it("distinguishes an explicit deployment disable from an unavailable contract", () => {
    expect(parsePediatricModeCapability({
      features: { pediatricMode: { ...pediatricCapability, enabled: false } },
    }).reason).toBe("DISABLED_BY_DEPLOYMENT")
    expect(parsePediatricModeCapability({
      features: { pediatricMode: { ...pediatricCapability, productionReady: false } },
    }).reason).toBe("CAPABILITY_UNAVAILABLE")
  })

  it.each([
    null,
    {},
    { features: {} },
    { features: { pediatricMode: true } },
    { features: { pediatricMode: { enabled: true } } },
    { features: { pediatricMode: { ...pediatricCapability, rulesetVersion: "" } } },
    { features: { pediatricMode: { ...pediatricCapability, minimumClientVersion: "latest" } } },
    { features: { pediatricMode: { ...pediatricCapability, reviewedDoseProfilesRequired: false } } },
  ])("fails Pediatric selection closed for missing or malformed input", value => {
    expect(parsePediatricModeCapability(value)).toEqual({
      enabled: false,
      reason: "CAPABILITY_UNAVAILABLE",
      productionReady: false,
      rulesetVersion: null,
      minimumClientVersion: null,
      reviewedDoseProfilesRequired: false,
    })
  })

  it("requires a client version accepted by the Pediatric contract", () => {
    expect(parsePediatricModeCapability({
      features: { pediatricMode: { ...pediatricCapability, minimumClientVersion: "99.0.0" } },
    })).toMatchObject({
      enabled: false,
      reason: "CLIENT_UPDATE_REQUIRED",
      minimumClientVersion: "99.0.0",
    })
  })

  it("uses distinct copy for a new selection and a preserved existing record", () => {
    const disabled = parsePediatricModeCapability({
      features: { pediatricMode: { ...pediatricCapability, enabled: false } },
    })
    expect(pediatricCapabilityMessageKey(disabled, false)).toBe("newSelectionDisabled")
    expect(pediatricCapabilityMessageKey(disabled, true)).toBe("existingRecordReadOnlyDisabled")
  })

  it("fails closed when the capability endpoint is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"))
    await expect(loadPediatricModeCapability()).resolves.toMatchObject({
      enabled: false,
      reason: "CAPABILITY_UNAVAILABLE",
    })
  })
})
