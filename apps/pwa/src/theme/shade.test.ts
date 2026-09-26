import { describe, expect, it } from "vitest"

import { shadeFor } from "./shade"

describe("shadeFor", () => {
  it("keeps every colour in dark", () => {
    expect(shadeFor("dark", "#0a1220")).toBe("#0a1220")
  })

  it("maps dark surfaces to light ones and keeps alpha", () => {
    expect(shadeFor("light", "#0a1220")).toBe("#f8fafc")
    expect(shadeFor("light", "#f9731633")).toBe("#f9731633".slice(0, 0) + shadeFor("light", "#f97316") + "33")
    expect(shadeFor("light", "#fff")).toBe("#0f172a")
  })

  it("leaves an unknown colour as it is", () => {
    expect(shadeFor("light", "#abcdef")).toBe("#abcdef")
  })
})
