import { describe, expect, it } from "vitest"
import {
  bearerMatchesAnySecret,
  configuredSecretOverlap,
  headerMatchesAnySecret,
  matchesAnySecret,
} from "./rotating-secret"

const current = "c".repeat(32)
const previous = "p".repeat(32)

describe("bounded operational-secret overlap", () => {
  it("retains only distinct, valid current and previous credentials", () => {
    expect(configuredSecretOverlap(current, previous, current, "short", ""))
      .toEqual([current, previous])
  })

  it("accepts both credentials during overlap and retires the old one when removed", () => {
    expect(matchesAnySecret(current, [current, previous])).toBe(true)
    expect(matchesAnySecret(previous, [current, previous])).toBe(true)
    expect(matchesAnySecret(previous, [current])).toBe(false)
    expect(matchesAnySecret("x".repeat(32), [current, previous])).toBe(false)
  })

  it("uses exact Bearer and named-header boundaries", () => {
    expect(bearerMatchesAnySecret(new Request("http://api/internal", {
      headers: { authorization: `Bearer ${previous}` },
    }), [current, previous])).toBe(true)
    expect(bearerMatchesAnySecret(new Request("http://api/internal", {
      headers: { authorization: `Basic ${previous}` },
    }), [current, previous])).toBe(false)
    expect(headerMatchesAnySecret(new Request("http://api/internal", {
      headers: { "x-snapshot-secret": current },
    }), "x-snapshot-secret", [current])).toBe(true)
  })
})
