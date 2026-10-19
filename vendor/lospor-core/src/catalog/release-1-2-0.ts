/**
 * The catalogues as the 1.2.0 clinical-rule baselines (adult and paediatric
 * v2) were built from them. Those baselines are fingerprinted, and every
 * appliance that installed them checks its copy against the fingerprint on
 * update, so a later catalogue change must not reach them: it belongs in a
 * new baseline version (v3 onwards reads the live catalogues). The menus
 * always read the live catalogues.
 */
import { DRUG_CATALOG, type DrugCatalogEntry } from "./intraop-drugs"
import { FLUID_CATALOG, type FluidCatalogEntry } from "./intraop-fluids"
import { INFUSION_CATALOG, type InfusionCatalogEntry } from "./intraop-infusions"

/** Fluids added after release 1.2.0. */
const FLUIDS_ADDED_AFTER_RELEASE_1_2_0 = new Set(["Ringer's solution"])

/** Fluid strengths that changed after release 1.2.0, as they were then. */
const FLUID_STRENGTHS_AT_RELEASE_1_2_0: Readonly<Record<string, string[]>> = { "Mannitol": ["10%", "15%"] }

/** Drugs regrouped on 2026-10-18 (with the colour of their group), as they were in 1.2.0. */
const DRUG_GROUPS_AT_RELEASE_1_2_0: Readonly<Record<string, { category: string; color: string }>> = {
  "Propofol": { category: "Neuro / ICP / anticonvulsants", color: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30" },
  "Ketamine": { category: "Regional anesthesia adjuvants", color: "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30" },
  "Thiopental / Thiopentone": { category: "Neuro / ICP / anticonvulsants", color: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30" },
  "Midazolam": { category: "Neuro / ICP / anticonvulsants", color: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30" },
  "Diazepam": { category: "Neuro / ICP / anticonvulsants", color: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30" },
  "Lorazepam": { category: "Neuro / ICP / anticonvulsants", color: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30" },
  "Dexmedetomidine": { category: "Regional anesthesia adjuvants", color: "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30" },
  "Clonidine": { category: "Regional anesthesia adjuvants", color: "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30" },
  "Promethazine": { category: "Anaphylaxis / allergy adjuncts", color: "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30" },
  "Fentanyl": { category: "Regional anesthesia adjuvants", color: "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30" },
  "Sufentanil": { category: "Regional anesthesia adjuvants", color: "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30" },
  "Morphine": { category: "Regional anesthesia adjuvants", color: "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30" },
  "Buprenorphine": { category: "Regional anesthesia adjuvants", color: "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30" },
  "Diamorphine": { category: "Regional anesthesia adjuvants", color: "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30" },
  "Metamizole": { category: "Other", color: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30" },
  "Magnesium sulfate": { category: "Neuro / ICP / anticonvulsants", color: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30" },
  "Lidocaine": { category: "Other", color: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30" },
  "Succinylcholine / Suxamethonium": { category: "Emergency drugs / antidotes / rescue agents", color: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30" },
  "Rocuronium": { category: "Emergency drugs / antidotes / rescue agents", color: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30" },
  "Sugammadex": { category: "Emergency drugs / antidotes / rescue agents", color: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30" },
  "Neostigmine": { category: "Emergency drugs / antidotes / rescue agents", color: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30" },
  "Glycopyrrolate": { category: "Emergency drugs / antidotes / rescue agents", color: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30" },
  "Atropine": { category: "Emergency drugs / antidotes / rescue agents", color: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30" },
  "Scopolamine / Hyoscine": { category: "Antiemetics / prokinetics", color: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30" },
  "Tetracaine / Amethocaine": { category: "Topical airway / nasal / ENT agents", color: "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30" },
  "Norepinephrine / Noradrenaline": { category: "Anaphylaxis / allergy adjuncts", color: "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30" },
  "Epinephrine / Adrenaline": { category: "Anaphylaxis / allergy adjuncts", color: "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30" },
  "Vasopressin": { category: "Anaphylaxis / allergy adjuncts", color: "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30" },
  "Methylene blue": { category: "Miscellaneous perioperative adjuncts", color: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30" },
  "Glucagon": { category: "Anaphylaxis / allergy adjuncts", color: "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30" },
  "Calcium chloride": { category: "Emergency drugs / antidotes / rescue agents", color: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30" },
  "Calcium gluconate": { category: "Emergency drugs / antidotes / rescue agents", color: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30" },
  "Nitroglycerin / Glyceryl trinitrate": { category: "Emergency drugs / antidotes / rescue agents", color: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30" },
  "Labetalol": { category: "Antiarrhythmics / cardiac rate control", color: "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30" },
  "Propranolol": { category: "Vasoactive drugs - antihypertensives / vasodilators", color: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30" },
  "Adenosine": { category: "Neuro / ICP / anticonvulsants", color: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30" },
  "Amiodarone": { category: "Emergency drugs / antidotes / rescue agents", color: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30" },
  "Ondansetron": { category: "Acid suppression / aspiration prophylaxis / GI adjuncts", color: "bg-lime-100 text-lime-700 border-lime-300 dark:bg-lime-500/15 dark:text-lime-300 dark:border-lime-500/30" },
  "Dexamethasone": { category: "Anaphylaxis / allergy adjuncts", color: "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30" },
  "Metoclopramide": { category: "Acid suppression / aspiration prophylaxis / GI adjuncts", color: "bg-lime-100 text-lime-700 border-lime-300 dark:bg-lime-500/15 dark:text-lime-300 dark:border-lime-500/30" },
  "Octreotide": { category: "Endocrine / metabolic / electrolytes", color: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30" },
  "Protamine": { category: "Emergency drugs / antidotes / rescue agents", color: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30" },
  "Tranexamic acid": { category: "Neuro / ICP / anticonvulsants", color: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30" },
  "Desmopressin": { category: "Neuro / ICP / anticonvulsants", color: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30" },
  "Prothrombin complex concentrate 4-factor": { category: "Emergency drugs / antidotes / rescue agents", color: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30" },
  "Methylergometrine": { category: "Other", color: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30" },
  "Terbutaline": { category: "Respiratory drugs / bronchodilators", color: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30" },
  "Sodium bicarbonate": { category: "Emergency drugs / antidotes / rescue agents", color: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30" },
  "Sodium chloride hypertonic (3%)": { category: "Other", color: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30" },
  "Furosemide": { category: "Neuro / ICP / anticonvulsants", color: "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30" },
  "Salbutamol / Albuterol": { category: "Anaphylaxis / allergy adjuncts", color: "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30" },
  "Acetylcysteine": { category: "Topical airway / nasal / ENT agents", color: "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30" },
  "Hyaluronidase": { category: "Emergency drugs / antidotes / rescue agents", color: "bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30" },
  "Valproic acid": { category: "Other", color: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30" },
  "Galantamine": { category: "Other", color: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30" },
}

/** Dose profiles changed after release 1.2.0 (regional anaesthesia adjuvant routes, 2026-10-18), as they were. */
const DRUG_PROFILES_AT_RELEASE_1_2_0: Readonly<Record<string, DrugCatalogEntry["profile"]>> = {
  "Fentanyl": {"min":0,"max":500,"step":10,"quickValues":[10,25,50,200],"unit":"mcg","routes":["IV","IM"],"doseCalc":{"perKg":1.5,"basis":"IBW","roundTo":25},"hint":"1.5 mcg/kg IBW"},
  "Sufentanil": {"min":0,"max":50,"step":1,"quickValues":[5,10,15,25,40],"unit":"mcg","routes":["IV"],"doseCalc":{"perKg":0.2,"basis":"IBW","roundTo":2.5},"hint":"0.2 mcg/kg IBW"},
  "Morphine": {"min":0,"max":60,"step":1,"quickValues":[2,4,5,10,15],"unit":"mg","routes":["IV","IM"],"doseCalc":{"perKg":0.1,"basis":"IBW","roundTo":1},"hint":"0.1 mg/kg IBW"},
  "Diamorphine": {"min":0,"max":10,"step":0.5,"quickValues":[1,2.5,5,7.5],"unit":"mg","routes":["IV","IM"],"doseCalc":{"perKg":0.05,"basis":"IBW","roundTo":0.5},"hint":"0.05 mg/kg IBW"},
  "Hydromorphone": {"min":0,"max":4,"step":0.1,"quickValues":[0.2,0.4,0.5,1,2],"unit":"mg","routes":["IV","IM"],"doseCalc":{"perKg":0.015,"basis":"IBW","roundTo":0.1},"hint":"0.015 mg/kg IBW"},
  "Clonidine": {"min":0,"max":300,"step":25,"quickValues":[50,75,100,150,200],"unit":"mcg","routes":["IV","PO"],"doseCalc":{"perKg":2,"basis":"IBW","roundTo":25},"hint":"2 mcg/kg IBW"},
  "Dexmedetomidine": {"min":0,"max":200,"step":5,"quickValues":[25,50,75,100,150],"unit":"mcg","routes":["IV"],"doseCalc":{"perKg":1,"basis":"IBW","roundTo":5},"hint":"1 mcg/kg IBW (loading dose)"},
  "Dexamethasone": {"min":0,"max":12,"step":2,"quickValues":[4,8,10,12],"unit":"mg","routes":["IV"],"doseCalc":{"flat":8},"hint":"8 mg"},
  "Buprenorphine": {"min":0,"max":600,"step":50,"quickValues":[150,300,450,600],"unit":"mcg","routes":["IV","IM","SL"],"doseCalc":{"flat":300},"hint":"300 mcg"},
  "Hyaluronidase": {"min":0,"max":1500,"step":150,"quickValues":[150,750,1500],"unit":"IU","routes":["SC","Local infiltration"],"doseCalc":{"flat":150},"hint":"150 IU"},
}

/** Infusion profiles changed after release 1.2.0 (epidural fentanyl, 2026-10-18), as they were. */
const INFUSION_PROFILES_AT_RELEASE_1_2_0: Readonly<Record<string, InfusionCatalogEntry["profile"]>> = {
  "Fentanyl": {"min":0,"max":3,"step":0.1,"quickValues":[0.5,1,1.5,2,3],"unit":"mcg/kg/hr","weightBasis":"IBW","suggestedRate":0.5},
  // Recorded in mL/hr only until 2026-10-18; mg/hr from v3.
  "Amiodarone": {"min":0,"max":20,"step":1,"quickValues":[5,10,15,20],"unit":"mL/hr","weightBasis":"none","suggestedRate":10,"prepStrength":{"mg":300,"mL":50}},
}

/** Infusions added after release 1.2.0 (2026-10-18). */
const INFUSIONS_ADDED_AFTER_RELEASE_1_2_0 = new Set([
  "Midazolam", "Remimazolam", "Clonidine", "Thiopental / Thiopentone", "Morphine", "Urapidil",
  "Methylene blue", "Tranexamic acid", "Potassium chloride", "Calcium gluconate", "Calcium chloride",
  "Sodium bicarbonate", "Hydrocortisone", "Pantoprazole", "Somatostatin",
])

export function infusionCatalogAtRelease120(): InfusionCatalogEntry[] {
  return INFUSION_CATALOG.filter(entry => !INFUSIONS_ADDED_AFTER_RELEASE_1_2_0.has(entry.name)).map(entry => {
    const profile = INFUSION_PROFILES_AT_RELEASE_1_2_0[entry.name]
    return profile ? { ...entry, profile } : entry
  })
}

export function fluidCatalogAtRelease120(): FluidCatalogEntry[] {
  return FLUID_CATALOG
    .filter(entry => !FLUIDS_ADDED_AFTER_RELEASE_1_2_0.has(entry.name))
    .map(entry => {
      const strengths = FLUID_STRENGTHS_AT_RELEASE_1_2_0[entry.name]
      return strengths ? { ...entry, profile: { ...entry.profile, concentrationOptions: [...strengths] } } : entry
    })
}

export function drugCatalogAtRelease120(): DrugCatalogEntry[] {
  return DRUG_CATALOG.map(entry => {
    const group = DRUG_GROUPS_AT_RELEASE_1_2_0[entry.name]
    const profile = DRUG_PROFILES_AT_RELEASE_1_2_0[entry.name]
    return {
      ...entry,
      ...(group ? { category: group.category, color: group.color } : {}),
      ...(profile ? { profile } : {}),
    }
  })
}
