import { describe, expect, it } from "vitest"
import {
  DEFAULT_CALLBACK_URL,
  loginUrlForCallback,
  safeCallbackUrl,
  safeResetPath,
} from "./safe-navigation"

describe("safeCallbackUrl", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/cases/new?continue=abc", "/cases/new?continue=abc"],
    ["/admin#pending", "/admin#pending"],
    ["/clinical-rules/rule-1", "/clinical-rules/rule-1"],
  ])("keeps an allowlisted internal callback", (input, expected) => {
    expect(safeCallbackUrl(input)).toBe(expected)
  })

  it.each([
    "https://evil.example/steal",
    "//evil.example/steal",
    "/\\evil.example",
    "/api/user/delete",
    "/login",
    "/cases-pretender",
    "/dashboard%0d%0aLocation:https://evil.example",
    "javascript:alert(1)",
    undefined,
  ])("falls back for an unsafe callback", input => {
    expect(safeCallbackUrl(input)).toBe(DEFAULT_CALLBACK_URL)
  })

  it("encodes the callback query value", () => {
    expect(loginUrlForCallback("/cases/new", "?continue=a&step=2"))
      .toBe("/login?callbackUrl=%2Fcases%2Fnew%3Fcontinue%3Da%26step%3D2")
  })
})

describe("safeResetPath", () => {
  it("keeps only a same-origin reset path", () => {
    expect(safeResetPath("https://app.example/reset-password?token=abc", "https://app.example"))
      .toBe("/reset-password?token=abc")
    expect(safeResetPath("javascript:alert(1)", "https://app.example")).toBeUndefined()
    expect(safeResetPath("https://evil.example/reset-password?token=abc", "https://app.example"))
      .toBeUndefined()
  })
})

