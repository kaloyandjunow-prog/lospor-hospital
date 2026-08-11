import { describe, expect, it } from "vitest"
import { createPediatricDrugProfileV2Payloads } from "./pediatric-drug-profiles-v2"
import { pediatricDrugProfilesFromRules } from "./clinical-rules"
import { applicablePediatricDrugProfiles } from "./clinical-rules/selection"

/**
 * The shipped paediatric ruleset must never put two bands on the same child.
 *
 * Both apps refuse to autofill a dose when several profiles apply, because
 * choosing between overlapping bands would mean inventing a number nobody
 * authored. That refusal is correct, but it is only invisible to clinicians
 * while the platform ruleset itself has no overlaps — an accidental overlap
 * introduced here would show up in theatre as a drug that has silently stopped
 * suggesting a dose.
 *
 * So this checks the ruleset, not the code. Every band edge is probed, since
 * an overlap can only begin or end at one.
 */
describe("the platform paediatric ruleset", () => {
  const rules = createPediatricDrugProfileV2Payloads().map((payload, index) => ({
    ruleKey: `platform.${index}`,
    ruleVersion: "1",
    payload,
    sourceIds: [],
    sourceRefs: [],
    origin: "PLATFORM" as const,
    presetId: "lospor-pediatrics-v2",
    scope: "PLATFORM" as const,
  }))
  const profiles = pediatricDrugProfilesFromRules(rules as never)

  it("ships profiles for every catalogued paediatric drug", () => {
    expect(profiles.length).toBeGreaterThan(200)
  })

  it("never puts two bands on the same child", () => {
    const weights = [null, 0.5, 1, 3, 5, 10, 20, 40, 70]
    const byDrug = new Map<string, typeof profiles>()
    for (const profile of profiles) {
      const key = profile.medicationKey
      byDrug.set(key, [...(byDrug.get(key) ?? []), profile])
    }

    const overlaps: string[] = []
    for (const [medicationKey, drugProfiles] of byDrug) {
      // An overlap can only start or end at a band edge, so probing the edges
      // is exhaustive and takes milliseconds rather than sweeping every day.
      const edges = new Set<number>()
      for (const profile of drugProfiles) {
        edges.add(profile.minimumAgeDays)
        edges.add(Math.max(0, profile.minimumAgeDays - 1))
        edges.add(Math.max(0, profile.maximumAgeDaysExclusive - 1))
        edges.add(profile.maximumAgeDaysExclusive)
      }
      for (const ageDays of edges) {
        for (const weightKg of weights) {
          const matching = applicablePediatricDrugProfiles({
            medicationKey,
            age: { value: ageDays, unit: "DAYS" },
            weightKg,
            profiles: drugProfiles,
          })
          if (matching.length > 1) {
            overlaps.push(`${medicationKey} at ${ageDays}d / ${weightKg ?? "no"}kg matches ${matching.length}`)
          }
        }
      }
    }

    expect(overlaps).toEqual([])
  })
})
