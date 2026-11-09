import { describe, expect, it } from "vitest"
import {
  catalogOptions,
  drugCatalogAtRelease120,
  drugCatalogAtRelease9150,
  FLUID_CATALOG,
  fluidCatalogAtRelease9150,
  intraopFluidConcept,
} from "./catalog"
import { clinicalRuleKey, validateClinicalRuleCollectionForPublication } from "./clinical-rules"
import { clinicalDisplayLabel } from "./display"
import { calcSuggestedDose } from "./dosing"
import { resolveFluidEntryModeProfile } from "./intraop-fluids"
import {
  clinicalDraftRuleKeys,
  createLosporAdultV3Draft,
  createLosporAdultV4Draft,
  createLosporPediatricV3Draft,
  createLosporPediatricV4Draft,
  type PlatformClinicalDraft,
} from "./platform-clinical-drafts"

/** Rule keys added, removed and changed between two drafts. */
function compare(before: PlatformClinicalDraft, after: PlatformClinicalDraft) {
  const old = new Map(before.rules.map(rule => [clinicalRuleKey(rule.payload), rule]))
  const added: string[] = []
  const changed: string[] = []
  for (const rule of after.rules) {
    const key = clinicalRuleKey(rule.payload)
    const previous = old.get(key)
    if (!previous) { added.push(key); continue }
    old.delete(key)
    if (JSON.stringify(previous) !== JSON.stringify(rule)) changed.push(key)
  }
  return { added: added.sort(), removed: [...old.keys()].sort(), changed: changed.sort() }
}

type Payload = { kind: string; itemKey?: string; medicationKey?: string; profile?: Record<string, unknown> | null }
const payloadOf = (draft: PlatformClinicalDraft, kind: string, name: string) =>
  draft.rules.map(rule => rule.payload as Payload)
    .find(payload => payload.kind === kind && (payload.itemKey ?? payload.medicationKey) === name)

describe("the 9.15.0 catalogue snapshot", () => {
  it("keeps every entry 10.2.0 changed as it was released", () => {
    const at = (name: string) => drugCatalogAtRelease9150().find(entry => entry.name === name)!.profile
    expect(at("Epinephrine / Adrenaline")).toMatchObject({ routes: ["IV"], doseCalc: { flat: 500 } })
    expect(at("Sugammadex").max).toBe(800)
    expect(at("Paracetamol / Acetaminophen").doseCalc).toEqual({ flat: 1000 })
    expect(at("Salbutamol / Albuterol").routes).toEqual(["IV"])
    expect(at("Glucagon").routes).toEqual(["IV"])
    const lipid = fluidCatalogAtRelease9150().find(entry => entry.name === "Lipid emulsion 20%")!
    expect(lipid.profile.fluidRate).toBeUndefined()
  })

  it("has no Glucose and no retired flag: neither existed in 9.15.0", () => {
    const fluids = fluidCatalogAtRelease9150()
    expect(fluids.some(entry => entry.name === "Glucose")).toBe(false)
    expect(fluids.some(entry => "retired" in entry)).toBe(false)
    expect(fluids.some(entry => entry.name === "Dextrose 5% (D5W)")).toBe(true)
  })

  it("is what the 1.2.0 snapshot is built on, so v2 never sees a 10.2.0 change", () => {
    const at120 = (name: string) => drugCatalogAtRelease120().find(entry => entry.name === name)!.profile
    expect(at120("Epinephrine / Adrenaline").doseCalc).toEqual({ flat: 500 })
    expect(at120("Sugammadex").max).toBe(800)
  })
})

describe("platform v4 drafts", () => {
  it("adult v4 adds Glucose and changes adrenaline, glucagon, sugammadex, paracetamol, salbutamol and lipid, nothing else", () => {
    const v4 = createLosporAdultV4Draft()
    expect(v4).toMatchObject({ id: "lospor-adults-v4", key: "LOSPOR_ADULTS", version: 4, clinicalMode: "ADULT", publishable: true })
    expect(v4.rules).toHaveLength(268)
    expect(compare(createLosporAdultV3Draft(), v4)).toEqual({
      added: ["ADULT_FLUID_PROFILE:GLUCOSE"],
      removed: [],
      changed: [
        "ADULT_DRUG_PROFILE:EPINEPHRINE_ADRENALINE",
        "ADULT_DRUG_PROFILE:GLUCAGON",
        "ADULT_DRUG_PROFILE:PARACETAMOL_ACETAMINOPHEN",
        "ADULT_DRUG_PROFILE:SALBUTAMOL_ALBUTEROL",
        "ADULT_DRUG_PROFILE:SUGAMMADEX",
        "ADULT_FLUID_PROFILE:LIPID_EMULSION_20",
      ],
    })
    const keys = clinicalDraftRuleKeys(v4)
    expect(new Set(keys).size).toBe(keys.length)
    expect(validateClinicalRuleCollectionForPublication(v4.rules.map(rule => ({ ruleKey: clinicalRuleKey(rule.payload), payload: rule.payload }))))
      .toEqual({ valid: true, issues: [] })
  })

  it("adult v4 opens adrenaline without a dose and offers it IM; v3 keeps 500 mcg IV", () => {
    const v4 = payloadOf(createLosporAdultV4Draft(), "ADULT_DRUG_PROFILE", "Epinephrine / Adrenaline")!.profile!
    expect(v4.doseCalc).toBeUndefined()
    expect(v4.routes).toEqual(["IV", "IM"])
    expect(v4.quickValues).toEqual([10, 50, 100, 1000])
    const v3 = payloadOf(createLosporAdultV3Draft(), "ADULT_DRUG_PROFILE", "Epinephrine / Adrenaline")!.profile!
    expect(v3.doseCalc).toMatchObject({ flat: 500 })
  })

  it("pediatric v4 changes exactly the doses the suggestions rely on", () => {
    const v4 = createLosporPediatricV4Draft()
    expect(v4).toMatchObject({ id: "lospor-pediatrics-v4", key: "LOSPOR_PEDIATRICS", version: 4, clinicalMode: "PEDIATRIC", publishable: true })
    // Hydrocortisone's three age bands become one weight-based band; Glucose joins.
    expect(v4.rules).toHaveLength(366)
    expect(compare(createLosporPediatricV3Draft(), v4)).toEqual({
      added: [
        "PEDIATRIC_DRUG_PROFILE:HYDROCORTISONE:0-6574.365",
        "PEDIATRIC_FLUID_PROFILE:GLUCOSE:0-6574.365",
      ],
      removed: [
        "PEDIATRIC_DRUG_PROFILE:HYDROCORTISONE:0-365.2425",
        "PEDIATRIC_DRUG_PROFILE:HYDROCORTISONE:2191.455-6574.365",
        "PEDIATRIC_DRUG_PROFILE:HYDROCORTISONE:365.2425-2191.455",
      ],
      changed: [
        "PEDIATRIC_DRUG_PROFILE:EPINEPHRINE_ADRENALINE:0-6574.365",
        "PEDIATRIC_DRUG_PROFILE:FUROSEMIDE:0-6574.365",
        "PEDIATRIC_DRUG_PROFILE:SALBUTAMOL_ALBUTEROL:0-6574.365",
        "PEDIATRIC_DRUG_PROFILE:SUGAMMADEX:0-6574.365",
        "PEDIATRIC_FLUID_PROFILE:CRYOPRECIPITATE:0-6574.365",
        "PEDIATRIC_FLUID_PROFILE:FRESH_FROZEN_PLASMA_FFP:0-6574.365",
        "PEDIATRIC_FLUID_PROFILE:LIPID_EMULSION_20:0-6574.365",
        "PEDIATRIC_FLUID_PROFILE:PACKED_RED_BLOOD_CELLS_PRBC:0-6574.365",
        "PEDIATRIC_FLUID_PROFILE:PLATELETS:0-6574.365",
      ],
    })
    const keys = clinicalDraftRuleKeys(v4)
    expect(new Set(keys).size).toBe(keys.length)
    expect(validateClinicalRuleCollectionForPublication(v4.rules.map(rule => ({ ruleKey: clinicalRuleKey(rule.payload), payload: rule.payload }))))
      .toEqual({ valid: true, issues: [] })
  })

  it("pediatric v4 doses: hydrocortisone 4 mg/kg ≤ 100, furosemide ≤ 40, sugammadex to 2,000, adrenaline IM ≤ 500", () => {
    const v4 = createLosporPediatricV4Draft()
    const profile = (name: string) => payloadOf(v4, "PEDIATRIC_DRUG_PROFILE", name)!.profile as {
      max?: number
      routes: string[]
      doseCalc?: Record<string, unknown>
      routeModes?: Record<string, { max: number; doseCalc?: Record<string, unknown> }>
    }
    expect(profile("Hydrocortisone").routeModes?.IV?.doseCalc).toMatchObject({ perKg: 4, cap: 100 })
    const furosemide = profile("Furosemide")
    expect(furosemide.routeModes?.IV?.doseCalc ?? furosemide.doseCalc).toMatchObject({ perKg: 1, cap: 40 })
    const sugammadex = profile("Sugammadex")
    expect(sugammadex.routeModes?.IV?.max ?? sugammadex.max).toBe(2000)
    const adrenaline = profile("Epinephrine / Adrenaline")
    expect(adrenaline.routes).toContain("IM")
    expect(adrenaline.routeModes?.IM).toMatchObject({ max: 500, doseCalc: { perKg: 10, cap: 500, basis: "TBW" } })
    // The IV arrest dose is unchanged.
    expect(adrenaline.routeModes?.IV?.doseCalc).toMatchObject({ perKg: 10, cap: 1000 })
  })

  it("pediatric v4 gives blood products by weight", () => {
    const v4 = createLosporPediatricV4Draft()
    const calc = (name: string) => payloadOf(v4, "PEDIATRIC_FLUID_PROFILE", name)!.profile!.doseCalc
    expect(calc("Packed red blood cells (PRBC)")).toMatchObject({ perKg: 15, basis: "TBW" })
    expect(calc("Fresh frozen plasma (FFP)")).toMatchObject({ perKg: 15 })
    expect(calc("Platelets")).toMatchObject({ perKg: 10 })
    expect(calc("Cryoprecipitate")).toMatchObject({ perKg: 5 })
    // v3 kept the adult bag volumes.
    expect(payloadOf(createLosporPediatricV3Draft(), "PEDIATRIC_FLUID_PROFILE", "Platelets")!.profile!.doseCalc).toBeUndefined()
  })
})

describe("10.2.0 catalogue behaviour", () => {
  const paracetamol = { flat: 1000, flatFromKg: 50, perKg: 15, basis: "TBW", roundTo: 50 }

  it("paracetamol suggests 15 mg/kg under 50 kg and 1 g from 50 kg", () => {
    expect(calcSuggestedDose(paracetamol, "IV", { weightKg: 40 }).dose).toBe("600")
    expect(calcSuggestedDose(paracetamol, "IV", { weightKg: 49 }).dose).toBe("750")
    expect(calcSuggestedDose(paracetamol, "IV", { weightKg: 50 }).dose).toBe("1000")
    expect(calcSuggestedDose(paracetamol, "IV", { weightKg: 90 }).dose).toBe("1000")
    // Without a weight the flat dose is the honest default.
    expect(calcSuggestedDose(paracetamol, "IV", {}).dose).toBe("1000")
  })

  it("lipid emulsion carries a starting rate of 15 mL/kg/h through the fluid profile", () => {
    const lipid = FLUID_CATALOG.find(entry => entry.name === "Lipid emulsion 20%")!
    const resolved = resolveFluidEntryModeProfile({ name: lipid.name, category: lipid.category, clinicalMode: "ADULT", profile: lipid.profile })
    expect(resolved.fluidRate.suggestedMlPerKgPerHour).toBe(15)
    // The shared slider range is untouched.
    expect(resolved.fluidRate).toMatchObject({ min: 1, max: 200, step: 1 })
  })

  it("offers Glucose at four strengths and maps each to its own concept", () => {
    const glucose = catalogOptions("INTRAOP_FLUID").find(option => option.label === "Glucose")
    expect(glucose).toBeDefined()
    expect(intraopFluidConcept({ name: "Glucose", concentration: "5%" })).toEqual({ table: "drug", conceptId: 19076324 })
    expect(intraopFluidConcept({ name: "Glucose", concentration: "10%" })).toEqual({ table: "drug", conceptId: 42937947 })
    expect(intraopFluidConcept({ name: "Glucose", concentration: "20%" })).toEqual({ table: "drug", conceptId: 589977 })
    expect(intraopFluidConcept({ name: "Glucose", concentration: "40%" })).toEqual({ table: "drug", conceptId: 36249595 })
    // The catalogue default (5%) when nothing was picked.
    expect(intraopFluidConcept({ name: "Glucose" })).toEqual({ table: "drug", conceptId: 19076324 })
    expect(clinicalDisplayLabel("option:INTRAOP_FLUID", "Glucose", "bg")).toBe("Glucose")
  })

  it("takes Dextrose 5% and 10% off the menus but still names and codes them on old cases", () => {
    const labels = catalogOptions("INTRAOP_FLUID").map(option => option.label)
    expect(labels).not.toContain("Dextrose 5% (D5W)")
    expect(labels).not.toContain("Dextrose 10% (D10W)")
    expect(clinicalDisplayLabel("option:INTRAOP_FLUID", "Dextrose 10% (D10W)", "en")).toBe("Glucose 10%")
    expect(intraopFluidConcept({ name: "Dextrose 10% (D10W)" })).toEqual({ table: "drug", conceptId: 42937947 })
    // The 5% mixtures stay on the menus.
    expect(labels).toContain("Dextrose 5% in 0.9% saline (D5NS)")
  })
})
