import { describe, expect, it } from "vitest"

import { PREMED_CATS, PREMED_DOSE_STEPS, PREMED_DOSES } from "./catalog/premed-drugs"
import { bundledOptions } from "./catalog"
import { mapPremedicationCategories, type LibraryOption } from "./option-library"
import { adultPremedDoseForRoute } from "./premedication"

// Adult premedication per route (1.4.9). The step rule: only 0.1, 1, 10 or 50,
// every range starting on a multiple of its step.

const onStep = (value: number, step: number) => Math.abs(value / step - Math.round(value / step)) < 1e-9

// Approved tablet strengths the stepper cannot reach; typed on the keypad.
const KEYPAD_DEFAULTS = new Set(["Midazolam PO", "Carvedilol PO"])

describe("the adult premedication table", () => {
  it("gives every drug and route a dose, range and step that follow the step rule", () => {
    // Every range starts at 0 (decision 2026-09-26).
    for (const config of Object.values(PREMED_DOSES)) {
      for (const rule of Object.values(config.routeDoses)) expect(rule.min).toBe(0)
    }
    for (const [name, config] of Object.entries(PREMED_DOSES)) {
      expect(config.routes).toContain(config.defaultRoute)
      expect(Object.keys(config.routeDoses)).toEqual(config.routes)
      for (const [route, rule] of Object.entries(config.routeDoses)) {
        const label = `${name} ${route}`
        expect(PREMED_DOSE_STEPS, label).toContain(rule.step)
        expect(onStep(rule.min, rule.step), `${label} min ${rule.min} is not on step ${rule.step}`).toBe(true)
        expect(onStep(rule.max, rule.step), `${label} max`).toBe(true)
        expect(rule.max, label).toBeGreaterThanOrEqual(rule.min)
        if (rule.dose == null) continue
        expect(rule.dose, label).toBeGreaterThanOrEqual(rule.min)
        expect(rule.dose, label).toBeLessThanOrEqual(rule.max)
        // A weight-based rule steps in calculated mg (step 1), not per kg.
        if (!KEYPAD_DEFAULTS.has(label) && !rule.perKg) expect(onStep(rule.dose, rule.step), `${label} default unreachable`).toBe(true)
      }
    }
  })

  it("lists every categorised drug and nothing retired", () => {
    for (const { drugs } of PREMED_CATS) for (const drug of drugs) expect(PREMED_DOSES[drug], drug).toBeDefined()
    expect(PREMED_DOSES.Ranitidine).toBeUndefined()
    expect(PREMED_DOSES.Buprenorphine.routes).not.toContain("SC")
    expect(PREMED_DOSES.Buprenorphine.routes).not.toContain("Transdermal")
    expect(PREMED_DOSES.Fentanyl.routes).not.toContain("Transdermal")
    expect(PREMED_DOSES.Promethazine.routes).not.toContain("IV")
    expect(PREMED_DOSES.Diazepam.routes).toContain("IM")
    expect(PREMED_DOSES.Ketamine.routes).toContain("PO")
    expect(PREMED_DOSES.Insulin.routes).toContain("IV")
  })
})

describe("adultPremedDoseForRoute", () => {
  it("replaces the dose on a route change: midazolam 7.5 mg PO is 1 mg IV", () => {
    expect(adultPremedDoseForRoute("Midazolam", "PO")).toMatchObject({ status: "suggested", dose: 7.5, unit: "mg", min: 0, max: 15, step: 1 })
    expect(adultPremedDoseForRoute("Midazolam", "IV")).toMatchObject({ status: "suggested", dose: 1, min: 0, max: 2.5, step: 0.1 })
  })

  it("uses micrograms where the dose is sub-milligram", () => {
    expect(adultPremedDoseForRoute("Clonidine", "PO")).toMatchObject({ dose: 150, unit: "mcg", min: 0, max: 300, step: 10 })
    expect(adultPremedDoseForRoute("Buprenorphine", "SL")).toMatchObject({ dose: 200, unit: "mcg", step: 10 })
  })

  it("records adult ketamine as calculated milligrams, never mg/kg", () => {
    expect(adultPremedDoseForRoute("Ketamine", "PO", 70)).toMatchObject({ status: "suggested", dose: 70, unit: "mg", min: 0, max: 140, step: 1 })
    expect(adultPremedDoseForRoute("Ketamine", "IV", 70)).toMatchObject({ dose: 18, unit: "mg", min: 0, max: 35 })
    expect(adultPremedDoseForRoute("Ketamine", "PO", null)).toMatchObject({ status: "needs-weight", dose: null })
  })

  it("leaves home medicines empty (as prescribed)", () => {
    for (const [drug, route] of [["Warfarin", "PO"], ["Insulin", "SC"], ["Insulin", "IV"], ["Levothyroxine", "PO"], ["Clonidine", "Transdermal"]]) {
      expect(adultPremedDoseForRoute(drug, route), `${drug} ${route}`).toMatchObject({ status: "as-prescribed", dose: null })
    }
  })

  it("knows nothing about a route the drug does not have", () => {
    expect(adultPremedDoseForRoute("Promethazine", "IV").status).toBe("unknown")
  })

  it("reads per-route doses from a seeded library row, and from the bundled table for an older row", () => {
    const rows = bundledOptions("PREMED_DRUG") as unknown as LibraryOption[]
    const midazolam = mapPremedicationCategories(rows).flatMap(category => category.drugs).find(drug => drug.name === "Midazolam")!
    expect(midazolam.routeDoses?.IV).toMatchObject({ dose: 1, step: 0.1 })
    expect(adultPremedDoseForRoute(midazolam, "IV").dose).toBe(1)
    expect(adultPremedDoseForRoute({ name: "Midazolam" }, "IV").dose).toBe(1)
  })
})
