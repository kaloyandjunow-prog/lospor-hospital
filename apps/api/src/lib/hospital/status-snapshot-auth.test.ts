import { describe, expect, it } from "vitest"
import { bearerToken, constantTimeTokenMatch } from "./status-snapshot-auth"

describe("internal appliance status authentication", () => {
  it("extracts only a non-empty Bearer token", () => {
    expect(bearerToken(new Request("http://api/internal", {
      headers: { authorization: "Bearer secret-value" },
    }))).toBe("secret-value")
    expect(bearerToken(new Request("http://api/internal"))).toBeNull()
    expect(bearerToken(new Request("http://api/internal", {
      headers: { authorization: "Basic secret-value" },
    }))).toBeNull()
  })

  it("requires an exact constant-time comparable token", () => {
    expect(constantTimeTokenMatch("secret-value", "secret-value")).toBe(true)
    expect(constantTimeTokenMatch("secret-valuE", "secret-value")).toBe(false)
    expect(constantTimeTokenMatch("short", "secret-value")).toBe(false)
    expect(constantTimeTokenMatch(null, "secret-value")).toBe(false)
  })
})
