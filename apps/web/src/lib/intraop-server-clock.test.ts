import { describe, expect, it, vi } from "vitest"

import { observedFetch, serverClock, serverNow } from "./intraop-clock"

// Every save to the API corrects the web's notion of now (9.13.0).

describe("the web's server-corrected clock", () => {
  it("learns the offset from a save's response", async () => {
    const fiveMinutesBehind = -5 * 60_000
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", {
      status: 200,
      headers: { "x-lospor-server-time": String(Date.now() + fiveMinutesBehind) },
    })))
    try {
      await observedFetch("/api/cases/case-1/events", { method: "POST" })
      expect(Math.abs(serverClock.offsetMs() - fiveMinutesBehind)).toBeLessThan(1_000)
      expect(Math.abs(serverNow().getTime() - (Date.now() + fiveMinutesBehind))).toBeLessThan(1_000)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
