import { describe, expect, it } from "vitest"

import { createServerClock, readServerTime, SERVER_TIME_HEADER } from "./server-clock"

describe("now from the server's clock", () => {
  it("corrects a device running ten minutes slow", () => {
    let device = Date.parse("2026-09-27T14:03:00.000Z")
    const clock = createServerClock(() => device)
    // Request out at device 14:03:00, back 200 ms later; the server said 14:13:00.1.
    clock.observe(Date.parse("2026-09-27T14:13:00.100Z"), device, device + 200)
    device += 200
    // The server stamped mid-flight; on arrival, 100 ms later, its clock reads .200.
    expect(clock.now().toISOString()).toBe("2026-09-27T14:13:00.200Z")
    expect(clock.offsetMs()).toBe(600_000)
  })

  it("keeps the most accurate sample and ignores a slow round trip", () => {
    const device = 1_000_000
    const clock = createServerClock(() => device)
    clock.observe(device + 5_000 + 50, device, device + 100)
    clock.observe(device + 9_999_999, device, device + 3_000)
    expect(clock.offsetMs()).toBe(5_000)
  })

  it("follows drift once a sample is old", () => {
    let device = 1_000_000
    const clock = createServerClock(() => device)
    clock.observe(device + 5_000 + 50, device, device + 100)
    device += 11 * 60_000
    clock.observe(device + 7_000 + 250, device, device + 500)
    expect(clock.offsetMs()).toBe(7_000)
  })

  it("is a difference of instants: no time zone and no time of day is read", () => {
    const headers = new Map([[SERVER_TIME_HEADER, "1790000000000"]])
    expect(readServerTime({ get: name => headers.get(name) ?? null })).toBe(1_790_000_000_000)
    // A formatted date, as a GMT+1 host might print one, is refused rather than parsed.
    const formatted = new Map([[SERVER_TIME_HEADER, "Sun, 27 Sep 2026 15:13:00 GMT+0100"]])
    expect(readServerTime({ get: name => formatted.get(name) ?? null })).toBeNull()
    expect(readServerTime({ get: () => null })).toBeNull()
  })

  it("does nothing until it has heard from the server", () => {
    const clock = createServerClock(() => 42)
    expect(clock.nowMs()).toBe(42)
  })
})
