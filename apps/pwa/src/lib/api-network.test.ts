import { beforeEach, describe, expect, it, vi } from "vitest"

const secureStore = vi.hoisted(() => ({
  setItemAsync: vi.fn(async () => {}),
  getItemAsync: vi.fn(async () => null),
  deleteItemAsync: vi.fn(async () => {}),
}))

vi.mock("expo-secure-store", () => secureStore)

describe("API request timeouts", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it("turns a stalled fetch into a network error after the requested deadline", async () => {
    global.fetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted")
        error.name = "AbortError"
        reject(error)
      }, { once: true })
    })) as unknown as typeof fetch

    const { apiJson } = await import("./api")
    const request = apiJson("/api/cases", { timeoutMs: 100 })
    const rejection = expect(request).rejects.toMatchObject({
      status: 0,
      code: "NETWORK",
    })

    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(100)

    await rejection
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/cases"),
      expect.not.objectContaining({ timeoutMs: expect.anything() }),
    )
  })
})
