import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => {
  class ApiError extends Error {
    status: number
    code?: string
    constructor(message: string, status: number, code?: string) {
      super(message)
      this.name = "ApiError"
      this.status = status
      this.code = code
    }
  }
  return { ApiError, apiFetch: vi.fn() }
})

// A real in-memory store: with a no-op KV the outbox has nothing to flush and
// never reaches the network at all, which silently makes the test vacuous.
const store = vi.hoisted(() => new Map<string, string>())

vi.mock("./api", () => api)
vi.mock("./clinical-sync-kv", () => ({
  clinicalSyncKv: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
    keys: vi.fn(async (prefix: string) =>
      [...store.keys()].filter(key => key.startsWith(prefix))),
  },
}))

/**
 * An unreachable API: never answers, but honours the abort signal the way a
 * real `fetch` does. A mock that ignores the signal hangs forever and tests
 * nothing — the abort is the whole mechanism under test.
 */
function hangingFetch(_path: string, init: RequestInit = {}) {
  return new Promise<never>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => {
      const error = new Error("Aborted")
      error.name = "AbortError"
      reject(error)
    })
  })
}

describe("autosave network circuit breaker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    store.clear()
  })

  it("does not touch the network again after a timeout, until the cooldown expires", async () => {
    const module = await import("./autosave-manager")
    module.resetAutosaveNetworkBreaker()
    api.apiFetch.mockImplementation(hangingFetch)

    // First save: pays the timeout once and trips the breaker.
    const first = module.autosaveManager.saveSection("case-1", "intraop", { hr: 70 }, { partial: true })
    await vi.waitFor(() => expect(module.autosaveNetworkState().down).toBe(true), { timeout: 10_000 })
    await first

    expect(api.apiFetch).toHaveBeenCalledTimes(1)

    // Second save while still offline: queued immediately, no network attempt.
    const started = Date.now()
    await module.autosaveManager.saveSection("case-1", "intraop", { hr: 71 }, { partial: true })

    expect(api.apiFetch).toHaveBeenCalledTimes(1) // unchanged — never re-attempted
    expect(Date.now() - started).toBeLessThan(500) // and it did not wait for a timeout
  }, 20_000)

  it("clears on a server response, so recovery is not delayed", async () => {
    const module = await import("./autosave-manager")
    module.resetAutosaveNetworkBreaker()
    api.apiFetch.mockImplementation(hangingFetch)

    await module.autosaveManager.saveSection("case-2", "intraop", { hr: 70 }, { partial: true })
    expect(module.autosaveNetworkState().down).toBe(true)

    module.resetAutosaveNetworkBreaker()
    api.apiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    await module.autosaveManager.saveSection("case-2", "intraop", { hr: 72 }, { partial: true })

    expect(module.autosaveNetworkState().down).toBe(false)
  }, 20_000)
})
