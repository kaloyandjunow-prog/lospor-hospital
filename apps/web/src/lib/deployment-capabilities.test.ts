import { afterEach, describe, expect, it, vi } from "vitest"
import {
  capabilityMessageKey,
  clearClinicalAiCapabilitiesCache,
  loadClinicalAiCapabilities,
  parseClinicalAiCapabilities,
} from "./deployment-capabilities"

afterEach(() => {
  clearClinicalAiCapabilitiesCache()
  vi.unstubAllGlobals()
})

describe("Hospital deployment capability parsing", () => {
  it("accepts the exact disabled appliance contract", () => {
    expect(parseClinicalAiCapabilities({ features: { clinicalAi: {
      clinicalAdvice: { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" },
      labImageExtraction: { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" },
      monitorOcr: { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" },
    } } })).toEqual({
      clinicalAdvice: { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" },
      labImageExtraction: { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" },
      monitorOcr: { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" },
    })
  })

  it.each([null, {}, { features: {} }, { features: { clinicalAi: {
    clinicalAdvice: { enabled: true, reason: "unexpected" },
  } } }])("fails closed for missing or malformed input", value => {
    expect(Object.values(parseClinicalAiCapabilities(value)).every(item => !item.enabled)).toBe(true)
  })

  it("uses installation-policy copy for the Hospital response", () => {
    expect(capabilityMessageKey("DISABLED_BY_DEPLOYMENT")).toBe("deploymentCapabilities.externalAiDisabled")
  })

  it("can bypass the short cache when Status changes policy", async () => {
    const enabled = { features: { clinicalAi: {
      clinicalAdvice: { enabled: true, reason: "ENABLED" },
      labImageExtraction: { enabled: true, reason: "ENABLED" },
      monitorOcr: { enabled: true, reason: "ENABLED" },
    } } }
    const disabled = { features: { clinicalAi: {
      clinicalAdvice: { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" },
      labImageExtraction: { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" },
      monitorOcr: { enabled: false, reason: "DISABLED_BY_DEPLOYMENT" },
    } } }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => enabled })
      .mockResolvedValueOnce({ ok: true, json: async () => disabled })
    vi.stubGlobal("fetch", fetchMock)

    expect((await loadClinicalAiCapabilities()).clinicalAdvice.enabled).toBe(true)
    expect((await loadClinicalAiCapabilities()).clinicalAdvice.enabled).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await loadClinicalAiCapabilities(true)).clinicalAdvice).toEqual({
      enabled: false,
      reason: "DISABLED_BY_DEPLOYMENT",
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
