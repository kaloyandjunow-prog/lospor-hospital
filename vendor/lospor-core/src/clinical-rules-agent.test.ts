import { describe, expect, it } from "vitest"
import { AGENT_CATALOG } from "./catalog"
import {
  adultDoseProfilesFromRules,
  clinicalRuleKey,
  createLosporAdultRulePayloads,
  pediatricAgentProfilesFromRules,
  validateClinicalRulePayload,
  type EffectiveClinicalRule,
} from "./clinical-rules"
import {
  createLosporAdultV4Draft,
  createLosporAdultV5Draft,
  createLosporPediatricV4Draft,
  createLosporPediatricV5Draft,
} from "./platform-clinical-drafts"

const asEffective = (rules: { payload: unknown }[]): EffectiveClinicalRule[] => rules.map(rule => ({
  id: clinicalRuleKey(rule.payload as never),
  ruleKey: clinicalRuleKey(rule.payload as never),
  ruleVersion: "test",
  payload: rule.payload,
  origin: "PLATFORM",
  presetId: "test",
  sourceRefs: [],
})) as unknown as EffectiveClinicalRule[]

describe("inhaled-agent rules (baseline v5)", () => {
  it("are in v5 and only in v5: v4 keeps exactly its rules", () => {
    expect(createLosporAdultV5Draft().rules.length).toBe(createLosporAdultV4Draft().rules.length + AGENT_CATALOG.length)
    expect(createLosporPediatricV5Draft().rules.length).toBe(createLosporPediatricV4Draft().rules.length + AGENT_CATALOG.length)
    for (const draft of [createLosporAdultV4Draft(), createLosporPediatricV4Draft()]) {
      expect(draft.rules.some(rule => String(rule.payload.kind).includes("AGENT"))).toBe(false)
    }
    // Nothing asks the adult builder for agents unless it is given them.
    expect(createLosporAdultRulePayloads().some(payload => payload.kind === "ADULT_AGENT_PROFILE")).toBe(false)
  })

  it("keep every v4 rule exactly as it was, in the same order", () => {
    for (const [v4, v5] of [[createLosporAdultV4Draft(), createLosporAdultV5Draft()], [createLosporPediatricV4Draft(), createLosporPediatricV5Draft()]] as const) {
      expect(v5.rules.slice(0, v4.rules.length)).toEqual(v4.rules)
      expect(new Set(v5.rules.map(rule => clinicalRuleKey(rule.payload))).size).toBe(v5.rules.length)
    }
  })

  it("carry today's values: range and step from the catalogue, and its quick buttons", () => {
    const rules = adultDoseProfilesFromRules(asEffective(createLosporAdultV5Draft().rules)).filter(rule => rule.kind === "ADULT_AGENT_PROFILE")
    expect(rules.map(rule => rule.itemKey).sort()).toEqual(AGENT_CATALOG.map(agent => agent.label).sort())
    for (const rule of rules) {
      const agent = AGENT_CATALOG.find(entry => entry.label === rule.itemKey)!
      const catalogue = agent.profile as { min: number; max: number; step: number; quickValues: number[] }
      expect([rule.profile.min, rule.profile.max, rule.profile.step, rule.profile.quickValues]).toEqual([catalogue.min, catalogue.max, catalogue.step, catalogue.quickValues])
    }
  })

  it("read back as paediatric agent rules at every age", () => {
    const rules = pediatricAgentProfilesFromRules(asEffective(createLosporPediatricV5Draft().rules))
    expect(rules.map(rule => rule.itemKey).sort()).toEqual(AGENT_CATALOG.map(agent => agent.label).sort())
    for (const rule of rules) {
      expect(rule.minimumAgeDays).toBe(0)
      expect(rule.maximumAgeDaysExclusive).toBeGreaterThan(18 * 365)
    }
  })

  it("are refused when the profile is not an agent's", () => {
    const bad = validateClinicalRulePayload({ kind: "ADULT_AGENT_PROFILE", itemKey: "X", labelEn: "X", profile: { kind: "bolus", min: 5, max: 1, step: 0.1, unit: "%" } })
    expect(bad.valid).toBe(false)
  })
})
