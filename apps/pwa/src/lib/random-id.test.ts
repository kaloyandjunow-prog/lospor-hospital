import { describe, expect, it } from "vitest"
import { randomHex } from "./random-id"
import { uid } from "./intraop-log-event"

describe("randomHex", () => {
  it("returns 2*byteLength lowercase hex characters", () => {
    expect(randomHex(8)).toMatch(/^[0-9a-f]{16}$/)
    expect(randomHex(4)).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe("uid", () => {
  it("is 16 hex chars and stays collision-free across many calls", () => {
    const ids = new Set<string>()
    for (let i = 0; i < 5000; i += 1) ids.add(uid())
    expect(ids.size).toBe(5000)
    expect(uid()).toMatch(/^[0-9a-f]{16}$/)
  })
})
