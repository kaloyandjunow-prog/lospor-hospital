import { describe, expect, it } from "vitest"
import { toClinicalLocale } from "./clinical-display"

describe("clinical display adapter", () => {
  it("normalizes application locales", () => {
    expect(toClinicalLocale("bg-BG")).toBe("bg")
    expect(toClinicalLocale("en-US")).toBe("en")
    expect(toClinicalLocale(undefined)).toBe("en")
  })
})
