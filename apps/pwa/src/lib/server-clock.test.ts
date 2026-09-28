import { describe, expect, it, vi } from "vitest"

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}))

// Every API response teaches the app's clock how far the device is from the
// server (9.13.0), and "now" on the timeline follows it.

describe("the app's server-corrected clock", () => {
  it("learns the offset from an ordinary API response", async () => {
    const tenMinutesAhead = 10 * 60_000
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "x-lospor-server-time": String(Date.now() + tenMinutesAhead) }),
      json: async () => ({}),
    })))
    const { apiFetch } = await import("./api")
    const { serverClock, serverNow } = await import("./server-clock")
    await apiFetch("/api/cases")
    expect(Math.abs(serverClock.offsetMs() - tenMinutesAhead)).toBeLessThan(1_000)
    expect(Math.abs(serverNow().getTime() - (Date.now() + tenMinutesAhead))).toBeLessThan(1_000)
  })
})
