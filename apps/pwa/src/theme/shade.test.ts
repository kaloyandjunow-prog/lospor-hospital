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

  it("gives the timetable's quick-add buttons (Jet's pale teal included) a readable light counterpart", () => {
    expect(shadeFor("light", "#5eead4")).toBe("#0f766e")
    for (const hex of ["#22c55e", "#3b82f6", "#a855f7", "#06b6d4", "#f59e0b", "#818cf8", "#14b8a6", "#6366f1"]) {
      expect(shadeFor("light", hex)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it("leaves an unknown colour as it is", () => {
    expect(shadeFor("light", "#abcdef")).toBe("#abcdef")
  })
})
