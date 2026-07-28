import { describe, expect, it } from "vitest"
import { parseDoseProfile } from "./dose-profile"
import { DRUG_CATALOG } from "./intraop-drugs"
import { INFUSION_CATALOG } from "./intraop-infusions"
import { FLUID_CATALOG } from "./intraop-fluids"
import { AGENT_CATALOG } from "./inhalational-agents"
import {
  BUNDLED_CATALOG_SNAPSHOT,
  CLINICAL_CATALOG,
  catalogOptions,
  normalizeOptionCode,
} from "./index"
import { LIBRARY_CATEGORIES } from "../option-contracts"

// Guards clinical data at the source: a malformed dose profile (bad range,
// missing unit, routeModes without min/max, etc.) fails here at test time
// rather than at seed time or — worse — silently in the app.
describe("option-library catalogs are valid dose profiles", () => {
  it("every intraop drug parses", () => {
    for (const e of DRUG_CATALOG) expect(() => parseDoseProfile(e.name, "bolus", e.profile), e.name).not.toThrow()
  })
  it("every infusion parses", () => {
    for (const e of INFUSION_CATALOG) expect(() => parseDoseProfile(e.name, "infusion", e.profile), e.name).not.toThrow()
  })
  it("every fluid parses", () => {
    for (const e of FLUID_CATALOG) expect(() => parseDoseProfile(e.name, "fluid", e.profile), e.name).not.toThrow()
  })
  it("every inhalational agent parses", () => {
    for (const e of AGENT_CATALOG) expect(() => parseDoseProfile(e.label, "agent", e.profile), e.label).not.toThrow()
  })

  it("catalogs are non-empty (guards against accidental wipe)", () => {
    expect(DRUG_CATALOG.length).toBeGreaterThan(0)
    expect(INFUSION_CATALOG.length).toBeGreaterThan(0)
    expect(FLUID_CATALOG.length).toBeGreaterThan(0)
    expect(AGENT_CATALOG.length).toBeGreaterThan(0)
  })

  it("has one deterministic row per category/value", () => {
    const keys = CLINICAL_CATALOG.map(option => `${option.category}:${option.value}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(CLINICAL_CATALOG.every(option =>
      option.id === `catalog:${option.category}:${option.value}`,
    )).toBe(true)
  })

  it("contains every required category and no dangling tree parents", () => {
    for (const category of LIBRARY_CATEGORIES) {
      const options = catalogOptions(category)
      expect(options.length, category).toBeGreaterThan(0)
      const ids = new Set(options.map(option => option.id))
      for (const option of options) {
        if (option.parentId) expect(ids.has(option.parentId), `${category}:${option.value}`).toBe(true)
      }
    }
  })

  it("resolves every alias to a catalog value", () => {
    expect(normalizeOptionCode("TECHNIQUE", "GENERAL_COMBINED")).toBe("GENERAL_BALANCED")
    expect(catalogOptions("TECHNIQUE").some(option => option.value === "GENERAL_BALANCED")).toBe(true)
    expect(normalizeOptionCode("TECHNIQUE", "COMBINED_SPINAL_EPIDURAL")).toBe("CSE")
    expect(catalogOptions("TECHNIQUE").some(option => option.value === "CSE")).toBe(true)
    expect(normalizeOptionCode("HANDOVER_ITEM", "obs_q15")).toBe("obs_freq")
    expect(catalogOptions("HANDOVER_ITEM").some(option => option.value === "obs_freq")).toBe(true)
  })

  it("ships a deterministic bundled snapshot", () => {
    expect(BUNDLED_CATALOG_SNAPSHOT.generatedAt).toBe("2026-07-24T00:00:00.000Z")
    for (const category of LIBRARY_CATEGORIES) {
      expect(Array.isArray(BUNDLED_CATALOG_SNAPSHOT[category])).toBe(true)
    }
  })
})
