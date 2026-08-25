import { describe, expect, it } from "vitest"
import { validateClinicalRulePayload } from "@lospor/core/clinical-rules"
import { evaluateClinicalBaseline } from "./clinical-baseline-safety"

function adultRule(availability: "AUTO" | "HIDDEN" = "AUTO") {
  const parsed = validateClinicalRulePayload({
    kind: "ADULT_DRUG_PROFILE",
    itemKey: "Propofol",
    labelEn: "Propofol",
    availability,
    profile: {
      kind: "bolus",
      mode: "dose",
      min: 0,
      max: 500,
      step: 10,
      quickValues: [50, 100, 200],
      unit: "mg",
      routes: ["IV"],
      defaultRoute: "IV",
      weightBasis: "TBW",
      doseCalc: { perKg: 2, basis: "TBW", roundTo: 10 },
    },
  })
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues))
  return {
    id: "adult-propofol",
    ruleKey: "ADULT_DRUG_PROFILE:PROPOFOL",
    ruleVersion: "adult.v2",
    payload: parsed.value,
    sourceRefs: ["bundled-adult-baseline"],
    origin: "INSTITUTION" as const,
    presetId: "adult-baseline",
    overrideId: null,
  }
}

function runtime(over: Record<string, unknown> = {}) {
  return {
    mode: "ADULT",
    preset: {
      id: "adult-baseline",
      name: "Adult baseline",
      version: 2,
      scope: "INSTITUTION",
      status: "PUBLISHED",
    },
    productionReady: true,
    effectiveRules: [adultRule()],
    doseProfiles: [],
    adultDoseProfiles: [{ ruleKey: "stale", ruleVersion: "wrong" }],
    ...over,
  }
}

describe("governed clinical baseline safety", () => {
  it("enables calculated prefills only from validated effective rules", () => {
    const result = evaluateClinicalBaseline(runtime(), "ADULT")

    expect(result.failure).toBe("NONE")
    expect(result.prospectiveGuidanceEnabled).toBe(true)
    expect(result.bundle.productionReady).toBe(true)
    expect(result.bundle.adultDoseProfiles).toEqual([
      expect.objectContaining({
        ruleKey: "ADULT_DRUG_PROFILE:PROPOFOL",
        ruleVersion: "adult.v2",
        presetId: "adult-baseline",
      }),
    ])
    expect(result.bundle.adultDoseProfiles).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleKey: "stale" })]),
    )
  })

  it.each([
    ["missing preset", { preset: null }, "MISSING"],
    ["wrong mode", { mode: "PEDIATRIC" }, "WRONG_MODE"],
    ["draft preset", { preset: { ...runtime().preset, status: "DRAFT" } }, "UNPUBLISHED"],
    ["missing version", { preset: { ...runtime().preset, version: undefined } }, "WRONG_VERSION"],
    ["zero version", { preset: { ...runtime().preset, version: 0 } }, "WRONG_VERSION"],
    ["not production ready", { productionReady: false }, "NOT_PRODUCTION_READY"],
    ["malformed rules", { effectiveRules: [{ bad: true }] }, "MALFORMED"],
  ])("fails closed for %s", (_label, over, expectedFailure) => {
    const result = evaluateClinicalBaseline(runtime(over), "ADULT")

    expect(result.prospectiveGuidanceEnabled).toBe(false)
    expect(result.bundle.productionReady).toBe(false)
    expect(result.failure).toBe(expectedFailure)
  })

  it("retains a valid hidden rule when publication readiness is false", () => {
    const result = evaluateClinicalBaseline(runtime({
      productionReady: false,
      effectiveRules: [adultRule("HIDDEN")],
    }), "ADULT")

    expect(result.prospectiveGuidanceEnabled).toBe(false)
    expect(result.bundle.adultDoseProfiles).toEqual([
      expect.objectContaining({ itemKey: "Propofol", availability: "HIDDEN" }),
    ])
  })
})
