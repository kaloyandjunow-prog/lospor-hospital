import { afterEach, describe, expect, it, vi } from "vitest"
import { parsePediatricModeCapability } from "@lospor/core/deployment-capabilities"
import {
  capabilityMessageKey,
  clearClinicalAiCapabilitiesCache,
  clearPediatricModeCapabilityCache,
  loadClinicalAiCapabilities,
  loadPediatricModeCapability,
  pediatricCapabilityMessageKey,
} from "./deployment-capabilities"

/**
 * Reading the declaration is core's, and tested there. What is this app's is
 * the copy it chooses and what it does when the endpoint will not answer.
 */

const pediatricCapability = {
  enabled: true,
  productionReady: true,
  rulesetVersion: "2026.08.04-release.1",
  minimumClientVersion: "8.0.0",
  reviewedDoseProfilesRequired: true,
}

function capability(over: Record<string, unknown> = {}) {
  return parsePediatricModeCapability(
    { features: { pediatricMode: { ...pediatricCapability, ...over } } },
    "9.7.0",
  )
}

describe("what this app says about an unavailable capability", () => {
  afterEach(() => {
    clearPediatricModeCapabilityCache()
    clearClinicalAiCapabilitiesCache()
    vi.restoreAllMocks()
  })

  it("distinguishes deployment policy from provider availability", () => {
    expect(capabilityMessageKey("DISABLED_BY_DEPLOYMENT"))
      .toBe("deploymentCapabilities.externalAiDisabled")
    expect(capabilityMessageKey("PROVIDER_NOT_CONFIGURED"))
      .toBe("deploymentCapabilities.externalAiUnavailable")
  })

  it("uses distinct copy for a new selection and a preserved existing record", () => {
    const disabled = capability({ enabled: false })
    expect(pediatricCapabilityMessageKey(disabled, false)).toBe("newSelectionDisabled")
    expect(pediatricCapabilityMessageKey(disabled, true)).toBe("existingRecordReadOnlyDisabled")
  })

  it("tells a clinician to update the app only when that is the reason", () => {
    const stale = capability({ minimumClientVersion: "99.0.0" })
    expect(pediatricCapabilityMessageKey(stale, false)).toBe("newSelectionClientUpdate")
    expect(pediatricCapabilityMessageKey(stale, true)).toBe("existingRecordReadOnlyClientUpdate")
  })

  /**
   * An unreviewed ruleset and an unreadable answer are different facts but the
   * same instruction at the bedside: this is not something you can turn on from
   * here. Both reach the unavailable copy.
   */
  it.each([
    ["an unreviewed ruleset", capability({ productionReady: false })],
    ["an answer it cannot read", capability({ reviewedDoseProfilesRequired: false })],
  ])("reads %s as unavailable rather than as switched off", (_name, value) => {
    expect(pediatricCapabilityMessageKey(value, false)).toBe("newSelectionUnavailable")
    expect(pediatricCapabilityMessageKey(value, true)).toBe("existingRecordReadOnlyUnavailable")
  })

  it("fails closed when the capability endpoint is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"))
    await expect(loadPediatricModeCapability()).resolves.toMatchObject({
      enabled: false,
      reason: "INVALID_CONTRACT",
    })
  })

  it("fails closed when the endpoint answers with an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 503 }),
    )
    await expect(loadPediatricModeCapability()).resolves.toMatchObject({
      enabled: false,
      reason: "INVALID_CONTRACT",
    })
  })
})

/**
 * This capability used to load once on mount and cache forever -- an
 * administrator disabling it in Status took effect on the phone within 15
 * seconds and on an open web tab only at the next reload. It now shares
 * pediatric mode's own freshness window instead of a separate, unbounded one.
 */
describe("AI capability shares pediatric mode's freshness window", () => {
  afterEach(() => {
    clearClinicalAiCapabilitiesCache()
    vi.restoreAllMocks()
  })

  function aiResponse(enabled: boolean): Response {
    const reason = enabled ? "ENABLED" : "PROVIDER_NOT_CONFIGURED"
    return new Response(JSON.stringify({
      features: { clinicalAi: {
        clinicalAdvice: { enabled, reason },
        labImageExtraction: { enabled, reason },
        monitorOcr: { enabled, reason },
      } },
    }), { status: 200 })
  }

  it("serves a fresh cached answer without asking again", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(aiResponse(true))
    await loadClinicalAiCapabilities()
    await loadClinicalAiCapabilities()
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it("asks again once the cached answer has gone stale", async () => {
    vi.useFakeTimers()
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(aiResponse(true))
    await loadClinicalAiCapabilities()
    vi.advanceTimersByTime(15_001)
    await loadClinicalAiCapabilities()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it("asks again immediately when forced, regardless of freshness", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(aiResponse(true))
    await loadClinicalAiCapabilities()
    await loadClinicalAiCapabilities(true)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("fails closed when the capability endpoint is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"))
    const capabilities = await loadClinicalAiCapabilities()
    expect(Object.values(capabilities).every(item => !item.enabled)).toBe(true)
  })
})
