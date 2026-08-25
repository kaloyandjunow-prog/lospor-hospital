import { describe, expect, it } from "vitest"
import { isPublicPath } from "./proxy"

describe("public route matching", () => {
  it("allows only exact public paths", () => {
    expect(isPublicPath("/login")).toBe(true)
    expect(isPublicPath("/terms")).toBe(true)
    expect(isPublicPath("/offline")).toBe(true)
    expect(isPublicPath("/login-malicious")).toBe(false)
    expect(isPublicPath("/privacy/archive")).toBe(false)
  })
})

