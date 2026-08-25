import { describe, expect, it } from "vitest"
import { localize, parseStatusLocale, statusLocale } from "./locale.js"

describe("Status locale", () => {
  it("defaults invalid and missing values to Bulgarian", () => {
    expect(statusLocale(undefined)).toBe("bg")
    expect(statusLocale("de")).toBe("bg")
  })

  it("accepts only the two shipped locales", () => {
    expect(parseStatusLocale("bg")).toBe("bg")
    expect(parseStatusLocale("en")).toBe("en")
    expect(parseStatusLocale("BG")).toBeNull()
  })

  it("selects copy deterministically", () => {
    expect(localize("bg", "Status", "Състояние")).toBe("Състояние")
    expect(localize("en", "Status", "Състояние")).toBe("Status")
  })
})
