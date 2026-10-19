import { describe, expect, it } from "vitest"
import { pediatricDrugProfilesFromRules, pediatricInfusionProfilesFromRules } from "./clinical-rules"
import {
  applicablePediatricDrugProfiles,
  applicablePediatricInfusionProfiles,
  resolvePediatricDrugProfileSurface,
  resolvePediatricInfusionProfileSurface,
} from "./clinical-rules/selection"
import { createPediatricDrugProfileV3Payloads } from "./pediatric-drug-profiles-v3"
import { createPediatricInfusionProfileSeeds } from "./pediatric-infusion-profiles"
import { volumeRateSurface } from "./volume-dose"

const asRules = <T,>(payloads: readonly T[]) => payloads.map((payload, index) => ({
  ruleKey: `platform.${index}`,
  ruleVersion: "1",
  payload,
  sourceIds: [],
  sourceRefs: [],
  origin: "PLATFORM" as const,
  presetId: "lospor-pediatrics-v3",
  scope: "PLATFORM" as const,
}))

const drugs = pediatricDrugProfilesFromRules(asRules(createPediatricDrugProfileV3Payloads()) as never)
const infusions = pediatricInfusionProfilesFromRules(asRules(createPediatricInfusionProfileSeeds().map(seed => seed.payload)) as never)

/** What the dose box shows for this child: the same path both apps take. */
function bolus(medicationKey: string, ageDays: number, weightKg: number, route?: string) {
  const age = { value: ageDays, unit: "DAYS" as const }
  const [rule, ...more] = applicablePediatricDrugProfiles({ medicationKey, age, weightKg, profiles: drugs })
  expect(more).toEqual([])
  if (!rule) return null
  return resolvePediatricDrugProfileSurface({ rule, age, route, weightKg, idealBodyWeightKg: weightKg })
}

function infusion(itemKey: string, ageDays: number, route?: string) {
  const [rule, ...more] = applicablePediatricInfusionProfiles({ itemKey, age: { value: ageDays, unit: "DAYS" }, profiles: infusions })
  expect(more).toEqual([])
  return rule ? resolvePediatricInfusionProfileSurface({ rule, route }) : null
}

describe("paediatric v3 prefills (2026-10-18)", () => {
  it("suggests a spinal volume that falls with the child's size", () => {
    expect(Number(bolus("Bupivacaine", 10, 4, "INTRATHECAL")?.dose)).toBe(0.8)
    expect(Number(bolus("Bupivacaine", 400, 10, "INTRATHECAL")?.dose)).toBe(0.8)
    expect(Number(bolus("Bupivacaine", 3650, 30, "INTRATHECAL")?.dose)).toBe(1.8)
    expect(Number(bolus("Bupivacaine", 6000, 70, "INTRATHECAL")?.dose)).toBe(3)
    expect(bolus("Bupivacaine", 10, 4, "INTRATHECAL")?.max).toBe(3)
  })

  it("suggests the drugs that were manual or protocol-only", () => {
    expect(Number(bolus("Esmolol", 2000, 20)?.dose)).toBe(10)
    expect(Number(bolus("Amiodarone", 2000, 20)?.dose)).toBe(100)
    expect(Number(bolus("Vitamin K / Phytomenadione", 10, 3)?.dose)).toBe(1)
    expect(Number(bolus("Vitamin K / Phytomenadione", 2000, 20)?.dose)).toBe(6)
    expect(Number(bolus("Succinylcholine / Suxamethonium", 10, 3)?.dose)).toBe(6)
  })

  it("gives antimicrobials and protamine a range but no dose", () => {
    const vancomycin = bolus("Vancomycin", 10, 3)
    expect(vancomycin).toMatchObject({ dose: "", max: 2000, availability: "MANUAL" })
    const protamine = bolus("Protamine", 2000, 20)
    expect(protamine).toMatchObject({ dose: "", max: 50, availability: "MANUAL" })
    expect(protamine?.quickValues.length).toBeGreaterThan(0)
  })

  it("hides only the children's bands it was asked to", () => {
    expect(bolus("Ibuprofen", 30, 4)).toBeNull()
    expect(bolus("Oxytocin", 3650, 30)).toBeNull()
    expect(Number(bolus("Oxytocin", 5000, 50)?.dose)).toBe(3)
    expect(bolus("Diazepam", 2000, 20)?.routes).not.toContain("IM")
    expect(infusion("Propofol", 10)?.disposition).toBe("HIDDEN")
    expect(infusion("Propofol", 100)?.suggestedRate).toBe(10)
  })

  it("suggests starting rates, by age where the rate differs", () => {
    expect(infusion("Unfractionated heparin", 180)?.suggestedRate).toBe(28)
    expect(infusion("Unfractionated heparin", 2000)?.suggestedRate).toBe(20)
    expect(infusion("Morphine", 10)?.suggestedRate).toBe(10)
    expect(infusion("Fentanyl", 10)?.suggestedRate).toBe(1)
    expect(infusion("Urapidil", 2000)).toMatchObject({ suggestedRate: 1, unit: "mg/kg/hr" })
  })

  it("keeps spinal-catheter and lidocaine neuraxial infusions away from children", () => {
    expect(infusion("Lidocaine", 2000)?.routes).toEqual(["IV"])
    expect(infusion("Ropivacaine", 2000)?.routes).not.toContain("INTRATHECAL")
  })

  it("sets epidural infusions in mL/kg/hr, limited by dose for the strength picked", () => {
    const neonate = infusion("Ropivacaine", 10, "EPIDURAL")!
    expect(neonate).toMatchObject({ unit: "mL/kg/hr", concentration: "0.1%", suggestedRate: 0.15, disposition: "AUTO" })
    // 0.2 mg/kg/hr: 0.2 mL/kg/hr of 0.1%, 0.1 of 0.2%.
    expect(volumeRateSurface({ ...neonate, concentration: "0.1%" }).max).toBe(0.2)
    expect(volumeRateSurface({ ...neonate, concentration: "0.2%" })).toMatchObject({ max: 0.1, suggestedRate: 0.08 })
    const child = infusion("Levobupivacaine", 2000, "PERINEURAL")!
    expect(volumeRateSurface({ ...child, concentration: "0.25%" }).max).toBe(0.16)
  })
})

describe("units fixed for the syringe step (2026-10-18)", () => {
  it("gives children's magnesium in mg/kg/hr, which grams of magnesium sulfate convert to", () => {
    expect(infusion("Magnesium sulfate", 2000)).toMatchObject({ unit: "mg/kg/hr", suggestedRate: 10, max: 60 })
  })
})
