import { describe, expect, it } from "vitest"
import {
  DEFAULT_RESEARCH_CALLBACK,
  researchLoginUrl,
  safeResearchCallback,
} from "./safe-navigation"

describe("safe research navigation", () => {
  it("retains an allowed workspace path, query, and fragment", () => {
    expect(safeResearchCallback("/cases/case-1?tab=events#row-2"))
      .toBe("/cases/case-1?tab=events#row-2")
  })

  it.each([
    "https://evil.example/cases",
    "//evil.example/cases",
    "/login",
    "/access-denied",
    "/cases\\..\\login",
    "/cases%0d%0aLocation:%20https://evil.example",
    "javascript:alert(1)",
  ])("rejects unsafe or authentication-loop callback %s", value => {
    expect(safeResearchCallback(value)).toBe(DEFAULT_RESEARCH_CALLBACK)
  })

  it("encodes a validated callback for the login page", () => {
    expect(researchLoginUrl("/compare", "?left=a&right=b"))
      .toBe("/login?callbackUrl=%2Fcompare%3Fleft%3Da%26right%3Db")
  })
})
