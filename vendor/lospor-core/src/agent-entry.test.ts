import { describe, expect, it } from "vitest"
import { AGENT_CATALOG } from "./catalog/inhalational-agents"
import { agentEntry } from "./agent-entry"

describe("inhaled agent entry", () => {
  it("takes every agent's range and step from the catalogue", () => {
    for (const agent of AGENT_CATALOG) {
      const profile = agent.profile as { min: number; max: number; step: number }
      const entry = agentEntry(agent.label)
      expect([entry.min, entry.max, entry.step]).toEqual([profile.min, profile.max, profile.step])
    }
  })

  it("lets desflurane reach its 18 %, not stop at 10", () => {
    expect(agentEntry("Desflurane").max).toBe(18)
    expect(agentEntry("Sevoflurane").max).toBe(8)
    expect(agentEntry("Isoflurane").max).toBe(5)
  })

  it("finds an agent by its label or its catalogue value, in any case", () => {
    expect(agentEntry("desflurane").max).toBe(18)
    expect(agentEntry("DESFLURANE").max).toBe(18)
    expect(agentEntry(" Sevoflurane ").max).toBe(8)
  })

  it("steps - and + by 0.1 and shows one decimal, while the slider lands on halves", () => {
    const entry = agentEntry("Sevoflurane")
    expect(entry.step).toBe(0.1)
    expect(entry.sliderStep).toBe(0.5)
    expect(entry.precision).toBe(1)
  })

  it("suggests the catalogue's quick values, but starts from 0", () => {
    const entry = agentEntry("Sevoflurane")
    expect(entry.quickValues).toEqual([1, 2, 2.5, 3, 8])
    expect(entry.prefill).toBe(0)
  })


  it("has one entry for every mode: quick buttons, range, step and a start at 0", () => {
    const entry = agentEntry("Desflurane")
    expect(entry.quickValues).toEqual([4, 6, 8, 12, 18])
    expect(entry.prefill).toBe(0)
    expect([entry.min, entry.max, entry.step]).toEqual([0, 18, 0.1])
  })


  it("gives an agent the catalogue does not know the old 0 to 10 at 0.1", () => {
    const entry = agentEntry("Xenon")
    expect([entry.min, entry.max, entry.step, entry.precision]).toEqual([0, 10, 0.1, 1])
    expect(entry.quickValues).toEqual([0.5, 1, 1.5, 2, 3])
  })

  it("holds every quick value the catalogue offers", () => {
    for (const agent of AGENT_CATALOG) {
      const entry = agentEntry(agent.label)
      for (const value of entry.quickValues) {
        expect(value).toBeGreaterThanOrEqual(entry.min)
        expect(value).toBeLessThanOrEqual(entry.max)
      }
    }
  })
})

describe("inhaled agent entry from a rule", () => {
  const rule = { min: 0, max: 9, step: 0.1, quickValues: [1, 2, 3] }

  it("takes the active rule's range, step and quick buttons over the catalogue's", () => {
    const entry = agentEntry("Sevoflurane", rule)
    expect([entry.min, entry.max, entry.step, entry.quickValues]).toEqual([0, 9, 0.1, [1, 2, 3]])
    expect(entry.prefill).toBe(0)
  })

  it("falls back to the catalogue when there is no rule, as on a baseline before v5", () => {
    expect(agentEntry("Sevoflurane", null).max).toBe(8)
    expect(agentEntry("Sevoflurane", undefined).quickValues).toEqual([1, 2, 2.5, 3, 8])
  })

  it("raises the ceiling to a quick button above it", () => {
    expect(agentEntry("Sevoflurane", { ...rule, quickValues: [1, 12] }).max).toBe(12)
  })
})
