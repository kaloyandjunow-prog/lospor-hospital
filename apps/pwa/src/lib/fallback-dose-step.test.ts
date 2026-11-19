import { describe, expect, it } from "vitest"
import { fallbackDoseStep } from "./fallback-dose-step"

describe("fallbackDoseStep", () => {
  it("steps by a unit a clinician would say aloud", () => {
    expect(fallbackDoseStep("mg")).toBe(1)
    expect(fallbackDoseStep("mcg")).toBe(10)
    expect(fallbackDoseStep("µg/kg/min")).toBe(10)
    expect(fallbackDoseStep("mL")).toBe(5)
    expect(fallbackDoseStep("g")).toBe(0.5)
    expect(fallbackDoseStep("IU")).toBe(1)
  })
  it("falls back to 1 for an unknown or missing unit", () => {
    expect(fallbackDoseStep(undefined)).toBe(1)
    expect(fallbackDoseStep("tabs")).toBe(1)
  })
})
