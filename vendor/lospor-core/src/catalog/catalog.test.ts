import { describe, expect, it } from "vitest"
import { parseDoseProfile } from "./dose-profile"
import { DRUG_CATALOG } from "./intraop-drugs"
import { INFUSION_CATALOG } from "./intraop-infusions"
import { FLUID_CATALOG } from "./intraop-fluids"
import { AGENT_CATALOG } from "./inhalational-agents"
import {
  BUNDLED_CATALOG_SNAPSHOT,
  CLINICAL_CATALOG,
  INTRAOP_ATC_CONFLICTS,
  catalogOptions,
  intraopAtcCode,
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

  it("codes every intraop drug, infusion and volatile agent with a 5th-level ATC", () => {
    // 5th level, e.g. N01AX10: letter, two digits, three letters, two digits.
    const fifthLevel = /^[A-V]\d{2}[A-Z]{2}\d{2}$/
    for (const entry of DRUG_CATALOG) {
      expect(entry.atcCode, entry.name).toMatch(fifthLevel)
    }
    for (const entry of INFUSION_CATALOG) {
      expect(entry.atcCode, entry.name).toMatch(fifthLevel)
    }
    for (const entry of AGENT_CATALOG) {
      expect(entry.atcCode, entry.label).toMatch(fifthLevel)
    }
  })

  it("codes every fluid except the three blood products that have no ATC code", () => {
    const fifthLevel = /^[A-V]\d{2}[A-Z]{2}\d{2}$/
    // Named, not counted: if a future entry loses its code this fails with the
    // drug's name rather than an off-by-one, and adding a fourth uncoded fluid
    // has to be a deliberate edit here.
    const noAtcCodeExists = new Set([
      "Cryoprecipitate",
      "Whole blood",
      "Cell salvage / autologous blood",
    ])
    for (const entry of FLUID_CATALOG) {
      if (noAtcCodeExists.has(entry.name)) {
        expect(entry.atcCode, entry.name).toBeUndefined()
        continue
      }
      expect(entry.atcCode, entry.name).toMatch(fifthLevel)
    }
  })

  it("gives one substance one code, whichever catalog recorded it", () => {
    // Propofol is a bolus and an infusion; the local anaesthetics are both
    // too. A query for propofol must not depend on which screen was used.
    expect(INTRAOP_ATC_CONFLICTS).toEqual([])
    const bolus = new Map(DRUG_CATALOG.map(entry => [entry.name, entry.atcCode]))
    const shared = INFUSION_CATALOG.filter(entry => bolus.has(entry.name))
    expect(shared.length).toBeGreaterThan(10)
    for (const entry of shared) {
      expect(entry.atcCode, entry.name).toBe(bolus.get(entry.name))
    }
  })

  it("resolves a stored event label back to its ATC code", () => {
    expect(intraopAtcCode("Propofol")).toBe("N01AX10")
    expect(intraopAtcCode("Sevoflurane")).toBe("N01AB08")
    // The inhalational agent catalog is keyed by value, not label, on some
    // surfaces; both must land on the same code.
    expect(intraopAtcCode("SEVOFLURANE")).toBe("N01AB08")
    expect(intraopAtcCode("Lactated Ringer's / Hartmann's")).toBe("B05BB01")
    // The web timetable labels a running infusion with its concentration.
    expect(intraopAtcCode("Propofol 1%")).toBe("N01AX10")
    // A fluid whose own name ends in a percentage keeps it.
    expect(intraopAtcCode("Albumin 20%")).toBe("B05AA01")
    expect(intraopAtcCode("Dextrose 5% (D5W)")).toBe("B05BA03")
    // Never invent a code for something the catalogs do not know.
    expect(intraopAtcCode("Whole blood")).toBeUndefined()
    expect(intraopAtcCode("Not a drug")).toBeUndefined()
    expect(intraopAtcCode(null)).toBeUndefined()
  })

  it("carries the ATC code into the option rows the apps read", () => {
    const propofol = catalogOptions("INTRAOP_DRUG").find(option => option.label === "Propofol")
    expect(propofol?.atcCode).toBe("N01AX10")
    const sevo = catalogOptions("INHALATIONAL_AGENT").find(option => option.value === "SEVOFLURANE")
    expect(sevo?.atcCode).toBe("N01AB08")
    const hes = catalogOptions("INTRAOP_FLUID").find(option => option.label === "HES")
    expect(hes?.atcCode).toBe("B05AA07")
    const whole = catalogOptions("INTRAOP_FLUID").find(option => option.label === "Whole blood")
    expect(whole?.atcCode).toBeNull()
  })

  it("ships a deterministic bundled snapshot", () => {
    expect(BUNDLED_CATALOG_SNAPSHOT.generatedAt).toBe("2026-07-24T00:00:00.000Z")
    for (const category of LIBRARY_CATEGORIES) {
      expect(Array.isArray(BUNDLED_CATALOG_SNAPSHOT[category])).toBe(true)
    }
  })
})
