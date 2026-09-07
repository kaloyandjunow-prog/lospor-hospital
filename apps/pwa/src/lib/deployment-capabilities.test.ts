import React from "react"
import { AppState, type AppStateStatus } from "react-native"
import { act } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@/test/render"
import { apiFetch } from "./api"
import {
  capabilityMessageKey,
  clearClinicalAiCapabilitiesCache,
  loadAuthenticationCapabilities,
  loadPediatricModeCapability,
  refreshClinicalAiCapabilities,
  useClinicalAiCapabilities,
  usePediatricModeCapability,
} from "./deployment-capabilities"

vi.mock("./api", () => ({ apiFetch: vi.fn() }))

const mockedApiFetch = vi.mocked(apiFetch)

function capabilitiesResponse(enabled: boolean): Response {
  const reason = enabled ? "ENABLED" : "DISABLED_BY_DEPLOYMENT"
  return {
    ok: true,
    json: vi.fn(async () => ({
      authentication: {
        loginIdentifier: "EMAIL",
        selfRegistration: true,
        passwordRecovery: "EMAIL",
      },
      features: {
        clinicalAi: {
          clinicalAdvice: { enabled, reason },
          labImageExtraction: { enabled, reason },
          monitorOcr: { enabled, reason },
        },
        pediatricMode: {
          enabled,
          productionReady: true,
          rulesetVersion: "2026.08.04-release.1",
          minimumClientVersion: "8.0.0",
          reviewedDoseProfilesRequired: true,
        },
      },
    })),
  } as unknown as Response
}

describe("how this app fetches and caches the declaration", () => {
  beforeEach(() => {
    clearClinicalAiCapabilitiesCache()
    mockedApiFetch.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("distinguishes an installation policy from an unavailable provider", () => {
    expect(capabilityMessageKey("DISABLED_BY_DEPLOYMENT")).toBe("externalAiDisabledDeployment")
    expect(capabilityMessageKey("PROVIDER_NOT_CONFIGURED")).toBe("externalAiProviderUnavailable")
  })

  it("deduplicates simultaneous refreshes from multiple mounted AI surfaces", async () => {
    mockedApiFetch.mockResolvedValue(capabilitiesResponse(true))
    const first = refreshClinicalAiCapabilities()
    const second = refreshClinicalAiCapabilities()

    expect(second).toBe(first)
    await expect(first).resolves.toMatchObject({
      clinicalAdvice: { enabled: true, reason: "ENABLED" },
    })
    expect(mockedApiFetch).toHaveBeenCalledOnce()
  })

  it("shares one capability request between AI and Pediatric consumers", async () => {
    mockedApiFetch.mockResolvedValue(capabilitiesResponse(true))

    const ai = refreshClinicalAiCapabilities()
    const pediatric = loadPediatricModeCapability()

    await expect(ai).resolves.toMatchObject({ clinicalAdvice: { enabled: true } })
    await expect(pediatric).resolves.toMatchObject({ enabled: true, reason: "ENABLED" })
    expect(mockedApiFetch).toHaveBeenCalledOnce()
  })

  it("shares one capability request with authentication consumers", async () => {
    mockedApiFetch.mockResolvedValue(capabilitiesResponse(true))

    const authentication = loadAuthenticationCapabilities()
    const pediatric = loadPediatricModeCapability()

    await expect(authentication).resolves.toMatchObject({
      status: "EXPLICIT",
      loginIdentifier: "EMAIL",
    })
    await expect(pediatric).resolves.toMatchObject({ enabled: true })
    expect(mockedApiFetch).toHaveBeenCalledOnce()
  })

  it("does not fall back to email when capability loading fails", async () => {
    mockedApiFetch.mockRejectedValue(new Error("offline"))

    await expect(loadAuthenticationCapabilities()).resolves.toEqual({
      status: "INVALID_CONTRACT",
      loginIdentifier: null,
      selfRegistration: false,
      passwordRecovery: "UNAVAILABLE",
    })
  })

  it("keeps Pediatric selection unavailable when capability loading fails", async () => {
    mockedApiFetch.mockRejectedValue(new Error("offline"))

    await expect(loadPediatricModeCapability()).resolves.toMatchObject({
      enabled: false,
      reason: "INVALID_CONTRACT",
    })
  })

  it("refreshes a mounted client when the app returns to the foreground", async () => {
    let appStateListener: ((state: AppStateStatus) => void) | undefined
    const remove = vi.fn()
    vi.mocked(AppState.addEventListener).mockImplementation((_event, listener) => {
      appStateListener = listener
      return { remove }
    })
    mockedApiFetch
      .mockResolvedValueOnce(capabilitiesResponse(false))
      .mockResolvedValueOnce(capabilitiesResponse(true))

    let latest = useClinicalAiCapabilities as unknown
    function Harness() {
      latest = useClinicalAiCapabilities()
      return null
    }
    const tree = render(React.createElement(Harness))
    await act(async () => { await Promise.resolve() })
    expect((latest as ReturnType<typeof useClinicalAiCapabilities>).clinicalAdvice.enabled).toBe(false)

    await act(async () => {
      appStateListener?.("active")
      await Promise.resolve()
    })

    expect(mockedApiFetch).toHaveBeenCalledTimes(2)
    expect((latest as ReturnType<typeof useClinicalAiCapabilities>).clinicalAdvice.enabled).toBe(true)
    act(() => tree.unmount())
    expect(remove).toHaveBeenCalledOnce()
  })

  it("polls Status-backed capabilities every 15 seconds", async () => {
    vi.useFakeTimers()
    mockedApiFetch
      .mockResolvedValueOnce(capabilitiesResponse(false))
      .mockResolvedValueOnce(capabilitiesResponse(true))

    let enabled = false
    function Harness() {
      enabled = useClinicalAiCapabilities().clinicalAdvice.enabled
      return null
    }
    const tree = render(React.createElement(Harness))
    await act(async () => { await Promise.resolve() })

    await act(async () => {
      vi.advanceTimersByTime(15_000)
      await Promise.resolve()
    })

    expect(mockedApiFetch).toHaveBeenCalledTimes(2)
    expect(enabled).toBe(true)
    act(() => tree.unmount())
  })

  it("updates the mounted Pediatric hook from the shared runtime contract", async () => {
    mockedApiFetch.mockResolvedValue(capabilitiesResponse(true))

    let latest = usePediatricModeCapability as unknown
    function Harness() {
      latest = usePediatricModeCapability()
      return null
    }
    const tree = render(React.createElement(Harness))
    await act(async () => { await Promise.resolve() })

    expect(latest).toMatchObject({ enabled: true, reason: "ENABLED" })
    expect(mockedApiFetch).toHaveBeenCalledOnce()
    act(() => tree.unmount())
  })
})
