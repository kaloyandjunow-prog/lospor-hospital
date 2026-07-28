import { describe, expect, it } from "vitest"
import { LOSPOR_API_PREFIX, LOSPOR_API_VERSION } from "./api"

describe("API contract", () => {
  it("keeps the version and canonical prefix aligned", () => {
    expect(LOSPOR_API_VERSION).toBe("v1")
    expect(LOSPOR_API_PREFIX).toBe(`/${LOSPOR_API_VERSION}`)
  })
})
