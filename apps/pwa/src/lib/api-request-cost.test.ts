import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Every API call used to perform two Android Keystore writes — recording the
 * last-ok and last-error timestamps through SecureStore on every response.
 * Those are encrypted operations, not variable assignments, and they sat on the
 * path of every poll, every autosave and every event recorded during a case.
 *
 * On web SecureStore is shimmed to localStorage and costs nothing, which is why
 * the PWA measured 23 ms per tab switch while the identical build measured
 * 1565 ms on the phone. This test keeps the request path free of it.
 */
const secure = vi.hoisted(() => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}))

vi.mock("expo-secure-store", () => secure)

describe("cost of a single API request", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    })))
  })

  it("writes nothing to SecureStore on a successful request", async () => {
    const { apiFetch } = await import("./api")
    await apiFetch("/api/cases")

    expect(secure.setItemAsync).not.toHaveBeenCalled()
  })

  it("writes nothing to SecureStore on a failed request either", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })))
    const { apiFetch } = await import("./api")
    await apiFetch("/api/cases")

    expect(secure.setItemAsync).not.toHaveBeenCalled()
  })

  it("still reports the last outcome to the settings screen", async () => {
    const api = await import("./api")
    await api.apiFetch("/api/cases")
    expect(await api.getLastOkRequest()).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 503, json: async () => ({}),
    })))
    await api.apiFetch("/api/cases")
    expect(await api.getLastApiError()).toContain("503")
  })

  it("does not wait on the network forever", async () => {
    // A request that never answers must abort rather than hang: one of these
    // inside the sync poll was what stopped the poller rescheduling.
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("Aborted")
          error.name = "AbortError"
          reject(error)
        })
      })))

    const { apiFetch } = await import("./api")
    vi.useFakeTimers()
    try {
      const inFlight = apiFetch("/api/cases").then(() => "settled", () => "aborted")
      await vi.advanceTimersByTimeAsync(25_000)
      await expect(inFlight).resolves.toBe("aborted")
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("token reads", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({}),
    })))
  })

  it("reads the token from SecureStore once, not once per request", async () => {
    secure.getItemAsync.mockResolvedValue("a-token" as never)
    const { apiFetch } = await import("./api")

    await apiFetch("/api/cases")
    await apiFetch("/api/cases")
    await apiFetch("/api/cases")

    // One Keystore decryption for three requests, not three.
    expect(secure.getItemAsync).toHaveBeenCalledTimes(1)
  })

  it("does not serve a stale token after sign-out or sign-in", async () => {
    secure.getItemAsync.mockResolvedValue("first-token" as never)
    const api = await import("./api")

    expect(await api.getToken()).toBe("first-token")

    await api.clearToken()
    expect(await api.getToken()).toBeNull()

    await api.setToken("second-token")
    expect(await api.getToken()).toBe("second-token")

    // Still only the one initial read — the writers keep the cache correct
    // rather than forcing it to re-read.
    expect(secure.getItemAsync).toHaveBeenCalledTimes(1)
  })
})
