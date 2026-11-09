/**
 * The catalogues as the 9.15.0 clinical-rule baselines (adult and paediatric
 * v3) were built from them. v3 read the live catalogues until it was released;
 * it is fingerprinted now, and every appliance that installed it checks its
 * copy on update, so a later catalogue change must not reach it. Changes from
 * 10.2.0 on belong to v4, which reads the live catalogues. The menus always
 * read the live catalogues.
 *
 * Each table holds an entry exactly as it was in 9.15.0. release-1-2-0.ts
 * builds on these, so its own overrides keep describing the difference
 * between 1.2.0 and 9.15.0.
 */
import { DRUG_CATALOG, type DrugCatalogEntry } from "./intraop-drugs"
import { FLUID_CATALOG, type FluidCatalogEntry } from "./intraop-fluids"
import { INFUSION_CATALOG, type InfusionCatalogEntry } from "./intraop-infusions"

/** Dose profiles changed in 10.2.0 (SPS), as they were. */
const DRUG_PROFILES_AT_RELEASE_9_15_0: Readonly<Record<string, DrugCatalogEntry["profile"]>> = {
  // 10.2.0: no default dose (500 mcg was the IM anaphylaxis dose); IM route added.
  "Epinephrine / Adrenaline": {"min":0,"max":1000,"step":10,"quickValues":[100,250,500,750],"unit":"mcg","routes":["IV"],"doseCalc":{"flat":500},"hint":"500 mcg"},
  // 10.2.0: maximum 2,000 mg (16 mg/kg rescue reversal).
  "Sugammadex": {"min":0,"max":800,"step":10,"quickValues":[100,200,400,600],"unit":"mg","routes":["IV"],"doseCalc":{"perKg":2,"basis":"TBW","roundTo":10},"hint":"2 mg/kg TBW (4 mg/kg if deep block)"},
  // 10.2.0: 15 mg/kg under 50 kg.
  "Paracetamol / Acetaminophen": {"min":0,"max":1000,"step":10,"quickValues":[500,650,1000],"unit":"mg","routes":["IV","PO"],"doseCalc":{"flat":1000},"hint":"1000 mg"},
  // 10.2.0: glucagon IM, for hypoglycaemia without IV access.
  "Glucagon": {"min":0,"max":5,"step":0.5,"quickValues":[1,2,5],"unit":"mg","routes":["IV"],"doseCalc":{"flat":1},"hint":"1 mg"},
  // 10.2.0: inhaled route (0.1 mg puffs through the circuit, or nebulised).
  "Salbutamol / Albuterol": {"min":0,"max":500,"step":50,"quickValues":[100,250,500],"unit":"mcg","routes":["IV"],"doseCalc":{"flat":250},"hint":"250 mcg"},
}

/** Fluids added in 10.2.0. */
const FLUIDS_ADDED_AFTER_RELEASE_9_15_0 = new Set(["Glucose"])

/** Fluid profiles changed in 10.2.0, as they were. */
const FLUID_PROFILES_AT_RELEASE_9_15_0: Readonly<Record<string, FluidCatalogEntry["profile"]>> = {
  // 10.2.0: a starting rate for the infusion (0.25 mL/kg/min).
  "Lipid emulsion 20%": {"min":0,"max":1000,"step":10,"quickValues":[50,100,150],"unit":"mL","doseCalc":{"perKg":1.5,"basis":"TBW","roundTo":10},"hint":"1.5 mL/kg TBW"},
}

/** Infusion profiles changed in 10.2.0, as they were. */
const INFUSION_PROFILES_AT_RELEASE_9_15_0: Readonly<Record<string, InfusionCatalogEntry["profile"]>> = {}

export function drugCatalogAtRelease9150(): DrugCatalogEntry[] {
  return DRUG_CATALOG.map(entry => {
    const profile = DRUG_PROFILES_AT_RELEASE_9_15_0[entry.name]
    return profile ? { ...entry, profile } : entry
  })
}

export function fluidCatalogAtRelease9150(): FluidCatalogEntry[] {
  return FLUID_CATALOG
    .filter(entry => !FLUIDS_ADDED_AFTER_RELEASE_9_15_0.has(entry.name))
    .map(entry => {
      const profile = FLUID_PROFILES_AT_RELEASE_9_15_0[entry.name]
      // Retiring a fluid from the menus (10.2.0) is not a rule change.
      const { retired: _retired, ...rest } = entry
      return profile ? { ...rest, profile } : rest
    })
}

export function infusionCatalogAtRelease9150(): InfusionCatalogEntry[] {
  return INFUSION_CATALOG.map(entry => {
    const profile = INFUSION_PROFILES_AT_RELEASE_9_15_0[entry.name]
    return profile ? { ...entry, profile } : entry
  })
}
