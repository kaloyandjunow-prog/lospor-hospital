import { describe, expect, it } from "vitest"
import { clinicalRuleKey, validateClinicalRuleCollectionForPublication } from "./clinical-rules"
import { createLosporAdultV2Draft, createLosporPediatricV2Draft } from "./platform-clinical-drafts"

describe("canonical bundled-baseline factories", () => {
  it.each([
    ["ADULT", "lospor-adults-v2", "LOSPOR_ADULTS", 2, 251, createLosporAdultV2Draft],
    ["PEDIATRIC", "lospor-pediatrics-v2", "LOSPOR_PEDIATRICS", 2, 335, createLosporPediatricV2Draft],
  ] as const)("locks the %s v2 factory identity and exact release count", (
    clinicalMode,
    id,
    key,
    version,
    ruleCount,
    factory,
  ) => {
    const first = factory()
    const second = factory()
    expect(first).toMatchObject({ id, key, version, clinicalMode, publishable: true, blockers: [] })
    expect(first.rules).toHaveLength(ruleCount)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    const ruleKeys = first.rules.map(rule => clinicalRuleKey(rule.payload))
    expect(new Set(ruleKeys).size).toBe(ruleKeys.length)
    expect(validateClinicalRuleCollectionForPublication(first.rules.map(rule => ({
      ruleKey: clinicalRuleKey(rule.payload),
      payload: rule.payload,
    })))).toEqual({ valid: true, issues: [] })
  })
})
