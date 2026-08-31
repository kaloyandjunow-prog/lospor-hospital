import {
  DRUG_CATALOG,
  FLUID_CATALOG,
  type DoseProfile,
  type LocalAnaestheticFormulation,
  type RouteMode,
} from "./catalog"
import {
  LOSPOR_ADULT_RULESET_KEY,
  clinicalRuleKey,
  createLosporAdultRulePayloads,
  validateClinicalRulePayload,
  type AdultDoseProfileRulePayload,
  type ClinicalRulePayload,
  type PediatricDrugPolicyDisposition,
  type PediatricDrugPolicyRulePayload,
  type PediatricDrugProfileRulePayload,
  type PediatricFluidProfileRulePayload,
} from "./clinical-rules"
import {
  FLUID_RATE_SLIDER,
  isBloodProductFluid,
  isMaintenanceCompatibleFluid,
} from "./intraop-fluids"
import { PEDIATRIC_SOURCE_REFERENCES } from "./pediatric"
import { createPediatricInfusionProfileSeeds } from "./pediatric-infusion-profiles"
import { createPediatricDrugProfileV2Payloads } from "./pediatric-drug-profiles-v2"

export const LOSPOR_PEDIATRIC_RULESET_KEY = "LOSPOR_PEDIATRICS" as const
export const LOSPOR_PEDIATRIC_RULESET_NAME = "LOSPOR Pediatric Rules" as const
export const LOSPOR_PEDIATRIC_RULESET_VERSION = 1 as const
export const LOSPOR_PEDIATRIC_V2_RULESET_VERSION = 2 as const
export const LOSPOR_ADULT_V2_RULESET_VERSION = 2 as const

export const PEDIATRIC_MAX_AGE_DAYS_EXCLUSIVE = 18 * 365.2425

export type ClinicalRuleSeed = {
  payload: ClinicalRulePayload
  sourceRefs: string[]
}

export type PlatformClinicalDraft = {
  id: string
  key: string
  name: string
  description: string
  clinicalMode: "ADULT" | "PEDIATRIC"
  version: number
  publishable: boolean
  blockers: string[]
  rules: ClinicalRuleSeed[]
}

type DrugPolicyOverride = {
  disposition: PediatricDrugPolicyDisposition
  rationaleEn: string
}

const ANTIMICROBIAL_POLICY_RATIONALE =
  "Route alone cannot select a pediatric antimicrobial regimen. Indication, procedure/site, expected pathogens, local resistance, cultures or colonisation, allergy, age or gestation, renal function, infusion timing, redosing and therapeutic drug monitoring may change the regimen. Platform scope therefore provides no antimicrobial autofill or quick-dose pills; an institution may add only an AMS/ID/pharmacy-approved local protocol with provenance and a review date."

const ROUTE_CONFLICT_RATIONALE =
  "The same route has materially different legitimate pediatric regimens. Keep manual entry until the selector can distinguish the required clinical context without guessing."

const PRODUCT_POLICY_RATIONALE =
  "Pediatric authorization, concentration or regimen varies by exact product or jurisdiction. Require the stocked product and an institution-approved formulary rule before exposing a profile."

const SCHEMA_BLOCKED_RATIONALE =
  "Evidence supports pediatric use, but the current route-only profile cannot retain all required age/weight, cumulative-dose, monitoring, paired-drug, formulation or protocol constraints. Keep manual until those constraints are executable and auditable."

const PEDIATRIC_SOURCE_REFS: Readonly<Record<string, readonly string[]>> = {
  "Etomidate": ["https://www.medicines.org.uk/emc/product/15214/smpc"],
  "Ondansetron": ["https://www.medicines.org.uk/emc/product/8482/smpc"],
  "Methohexital": [
    "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=eccd8340-ead3-4363-8902-0c19d33aa2ac&version=17",
  ],
  "Chlorphenamine / Chlorpheniramine": [
    "https://www.medicines.org.uk/emc/product/10595/smpc",
  ],
  "Propofol": ["https://www.medicines.org.uk/emc/product/5492/smpc"],
  "Ketamine": ["https://www.medicines.org.uk/emc/product/2420/smpc"],
  "Thiopental / Thiopentone": ["https://www.medicines.org.uk/emc/product/9376/smpc"],
  "Midazolam": ["https://www.medicines.org.uk/emc/product/13192/smpc"],
  "Diazepam": ["https://www.medicines.org.uk/emc/product/6274/smpc"],
  "Fentanyl": ["https://www.medicines.org.uk/emc/product/3387/smpc"],
  "Morphine": ["https://www.medicines.org.uk/emc/product/3576/smpc"],
  "Sufentanil": [
    "https://www.bfarm.de/DE/Arzneimittel/Zulassung/Arzneimittel-fuer-Kinder/Empfehlungen/Fach-und-Gebrauchsinformationen/sufentanil.html",
  ],
  "Remifentanil": ["https://www.medicines.org.uk/emc/product/795/smpc"],
  "Alfentanil": ["https://www.medicines.org.uk/emc/product/6427/smpc"],
  "Pethidine / Meperidine": ["https://www.medicines.org.uk/emc/product/6596/smpc"],
  "Paracetamol / Acetaminophen": ["https://www.medicines.org.uk/emc/product/15148/smpc"],
  "Ibuprofen": ["https://www.medicines.org.uk/emc/product/4560/smpc"],
  "Metoclopramide": ["https://www.medicines.org.uk/emc/product/6283/smpc"],
  "Droperidol": [
    "https://www.medicines.org.uk/emc/product/7310/smpc",
    "https://www.ashp.org/-/media/assets/policy-guidelines/docs/endorsed-documents/endorsed-documents-fourth-consensus-guidelines-postop-nausea-vomiting.ashx?la=en",
  ],
  "Succinylcholine / Suxamethonium": ["https://www.medicines.org.uk/emc/product/5189/smpc"],
  "Rocuronium": ["https://www.medicines.org.uk/emc/product/10504/smpc"],
  "Cisatracurium": ["https://www.medicines.org.uk/emc/product/12629/smpc"],
  "Atracurium": ["https://www.medicines.org.uk/emc/product/12628/smpc"],
  "Vecuronium": ["https://www.medicines.org.uk/emc/product/14772/smpc"],
  "Sugammadex": ["https://www.medicines.org.uk/emc/product/100727/smpc"],
  "Neostigmine": ["https://www.medicines.org.uk/emc/product/6268/smpc"],
  "Glycopyrrolate": ["https://www.medicines.org.uk/emc/product/3389/smpc"],
  "Flumazenil": ["https://www.medicines.org.uk/emc/product/6300/smpc"],
  "Promethazine": ["https://www.medicines.org.uk/emc/product/1100/smpc"],
  "Remimazolam": ["https://www.medicines.org.uk/emc/product/12746/smpc"],
  "Clonidine": ["https://www.medicines.org.uk/emc/product/100410/smpc"],
  "Palonosetron": ["https://www.medicines.org.uk/emc/product/12627/smpc"],
  "Tropisetron": ["https://www.medsafe.govt.nz/Profs/datasheet/t/tropisetronaftinj.pdf"],
  "Cyclizine": ["https://www.medicines.org.uk/emc/product/9275/smpc"],
  "Fosaprepitant": ["https://www.medicines.org.uk/emc/product/5947/smpc"],
  "Dimenhydrinate": [
    "https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?setid=bc71539e-1a33-4709-8a24-c2894e8dbc1c&type=pdf",
  ],
  "Ketorolac": ["https://www.medicines.org.uk/emc/product/14193/smpc"],
  "Diclofenac": ["https://www.medicines.org.uk/emc/product/1043/smpc"],
  "Dexketoprofen": ["https://cima.aemps.es/cima/dochtml/ft/64888/FT_64888.html"],
  "Ketoprofen": ["https://cima.aemps.es/cima/dochtml/ft/55857/FichaTecnica_55857.html"],
  "Parecoxib": ["https://www.medicines.org.uk/emc/product/1606/smpc"],
  "Lornoxicam": ["https://cima.aemps.es/cima/dochtml/ft/78274/FT_78274.html"],
  "Tenoxicam": [
    "https://ndi.fda.moph.go.th/uploads/drug_detail_corporation/doc/word/1163/9bd4a015f166f3eafec737266142a742-a1.pdf",
  ],
  "Nefopam": ["https://www.medicines.org.uk/emc/product/15926/smpc"],
  "Metamizole": [
    "https://www.ema.europa.eu/en/documents/referral/metamizole-article-31-referral-annex-iii_en.pdf",
    "https://www.anm.ro/_/_RCP/RCP_12649_14.11.19.pdf",
  ],
  "Haloperidol": ["https://www.medicines.org.uk/emc/product/101458/smpc"],
  "Granisetron": ["https://www.medicines.org.uk/emc/product/6423/smpc"],
  "Buprenorphine": [
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=23aa1bb3-cecf-4e62-29bb-48488bb66fc3",
  ],
  "Diamorphine": ["https://www.medicines.org.uk/emc/product/1466/smpc"],
  "Hydromorphone": [
    "https://medikamente.basg.gv.at/documents/135565__DOTC_FACH_INFO.pdf",
    "https://www.medicines.org.uk/emc/product/7685/smpc",
  ],
  "Oxycodone": ["https://www.medicines.org.uk/emc/product/12680/smpc"],
  "Methadone": ["https://www.medicines.org.uk/emc/product/3578/smpc"],
  "Nalbuphine": [
    "https://www.ema.europa.eu/en/documents/psusa/nalbuphine-cmdh-scientific-conclusions-grounds-variation-amendments-product-information-timetable-implementation-ema-94832-2024_en.pdf",
  ],
  "Butorphanol": [
    "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=9822ca3f-aee2-46e5-8a96-495400e65d10",
  ],
  "Hydroxocobalamin": ["https://www.medicines.org.uk/emc/product/4786/smpc"],
  "Glucagon": ["https://www.medicines.org.uk/emc/product/1289/smpc"],
  "Sildenafil": ["https://www.medicines.org.uk/emc/product/2850/smpc"],
  "Norepinephrine / Noradrenaline": ["https://www.medicines.org.uk/emc/product/5353/smpc"],
  "Vasopressin": ["https://www.medicines.org.uk/emc/product/10362/smpc"],
  "Nitroglycerin / Glyceryl trinitrate": ["https://www.medicines.org.uk/emc/product/100623/smpc"],
  "Protamine": ["https://www.medicines.org.uk/emc/product/8/smpc"],
  "Prothrombin complex concentrate 4-factor": ["https://www.medicines.org.uk/emc/product/6354/smpc"],
  "Esmolol": ["https://www.medicines.org.uk/emc/product/3057/smpc"],
  "Labetalol": ["https://www.medicines.org.uk/emc/product/10155/smpc"],
  "Metoprolol": ["https://www.medicines.org.uk/emc/product/866/smpc"],
  "Diltiazem": [
    "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=5e36488b-8f2d-4dc9-b803-af1829e6fdd0",
  ],
  "Terlipressin": ["https://www.medicines.org.uk/emc/product/101175/smpc"],
  "Octreotide": ["https://www.medicines.org.uk/emc/product/376/smpc"],
  "Levosimendan": ["https://spc.fimea.fi/indox/nam/html/nam/humspc/2/23533602.pdf"],
  "Bivalirudin": ["https://www.medicines.org.uk/emc/product/100183/smpc"],
  "Tenecteplase": ["https://www.medicines.org.uk/emc/product/15859/smpc"],
  "Galantamine": ["https://www.anm.ro/_/_RCP/RCP_13381_07.08.20.pdf"],
}

const ANTIMICROBIAL_SOURCE_REFS = [
  "https://www.childrens.health.qld.gov.au/__data/assets/pdf_file/0036/176895/gdl-01064.pdf",
  "https://www.nice.org.uk/guidance/ng125/chapter/recommendations",
  "https://www.gov.uk/government/publications/antimicrobial-stewardship-start-smart-then-focus/start-smart-then-focus-antimicrobial-stewardship-toolkit-for-inpatient-care-settings",
  "https://www.who.int/publications/i/item/9789240062382",
] as const

const DRUG_POLICY_OVERRIDES = new Map<string, DrugPolicyOverride>()

function assignDrugPolicy(names: readonly string[], override: DrugPolicyOverride): void {
  for (const name of names) DRUG_POLICY_OVERRIDES.set(name, override)
}

assignDrugPolicy(
  ["Ondansetron", "Chlorphenamine / Chlorpheniramine"],
  {
    disposition: "AUTOFILL_PROFILE",
    rationaleEn: "The approved platform ruleset provides a route-only starting profile from official product information.",
  },
)

assignDrugPolicy([
  "Propofol",
  "Ketamine",
  "Thiopental / Thiopentone",
  "Midazolam",
  "Diazepam",
  "Fentanyl",
  "Morphine",
  "Sufentanil",
  "Remifentanil",
  "Alfentanil",
  "Pethidine / Meperidine",
  "Promethazine",
  "Succinylcholine / Suxamethonium",
  "Rocuronium",
  "Vecuronium",
  "Cisatracurium",
  "Atracurium",
  "Pancuronium",
  "Mivacurium",
  "Glycopyrrolate",
  "Atropine",
  "Naloxone",
  "Hydrocortisone",
  "Methylprednisolone",
  "Furosemide",
  "Levetiracetam",
  "Phenobarbital",
  "Phenytoin",
  "Digoxin",
  "Verapamil",
  "Ephedrine",
  "Metaraminol",
  "Propranolol",
  "Regular insulin / Actrapid",
  "Potassium chloride",
  "Potassium phosphate",
  "Sodium phosphate",
  "Sodium chloride hypertonic (3%)",
  "Valproic acid",
  "Milrinone",
  "Methylene blue",
  "Acetylcysteine",
  "Unfractionated heparin",
  "Vitamin K / Phytomenadione",
  "Fibrinogen concentrate",
  "Activated factor VII / Eptacog alfa",
  "Alteplase",
], {
  disposition: "MANUAL_NO_PROFILE",
  rationaleEn: ROUTE_CONFLICT_RATIONALE,
})

assignDrugPolicy([
  "Etomidate",
  "Methohexital",
  "Paracetamol / Acetaminophen",
  "Metoclopramide",
  "Droperidol",
  "Sugammadex",
  "Neostigmine",
  "Flumazenil",
  "Bupivacaine",
  "Levobupivacaine",
  "Ropivacaine",
  "Mepivacaine",
  "Prilocaine",
  "Chloroprocaine",
  "Tetracaine / Amethocaine",
  "Hydroxocobalamin",
  "Glucagon",
  "Sildenafil",
], {
  disposition: "SCHEMA_BLOCKED",
  rationaleEn: SCHEMA_BLOCKED_RATIONALE,
})

assignDrugPolicy([
  "Ibuprofen",
  "Dimenhydrinate",
  "Ketorolac",
  "Ketoprofen",
  "Nefopam",
  "Metamizole",
  "Buprenorphine",
  "Diamorphine",
  "Hydromorphone",
  "Oxycodone",
  "Nalbuphine",
], {
  disposition: "FORMULARY_REQUIRED",
  rationaleEn: PRODUCT_POLICY_RATIONALE,
})

assignDrugPolicy([
  "Remimazolam",
  "Clonidine",
  "Palonosetron",
  "Tropisetron",
  "Cyclizine",
  "Fosaprepitant",
  "Diclofenac",
  "Dexketoprofen",
  "Parecoxib",
  "Lornoxicam",
  "Tenoxicam",
  "Haloperidol",
  "Granisetron",
  "Methadone",
  "Butorphanol",
  "Norepinephrine / Noradrenaline",
  "Vasopressin",
  "Nitroglycerin / Glyceryl trinitrate",
  "Protamine",
  "Prothrombin complex concentrate 4-factor",
  "Esmolol",
  "Labetalol",
  "Metoprolol",
  "Diltiazem",
  "Terlipressin",
  "Octreotide",
  "Levosimendan",
  "Bivalirudin",
  "Tenecteplase",
  "Galantamine",
], {
  disposition: "EXCLUDED",
  rationaleEn: "No platform pediatric perioperative profile is supported by the cited product information. An institution may revisit only with an exact locally authorized product and governance review.",
})

function policySeedForDrug(entry: typeof DRUG_CATALOG[number]): ClinicalRuleSeed {
  const isAntimicrobial = entry.category === "Antimicrobials often given intraoperatively"
  const isObstetric = entry.category === "Obstetric uterotonics / tocolytics"
    || entry.name === "Methylergometrine"
  const sourceRefs = isAntimicrobial
    ? [...ANTIMICROBIAL_SOURCE_REFS]
    : [...(PEDIATRIC_SOURCE_REFS[entry.name] ?? [])]
  const override = isAntimicrobial
    ? {
        disposition: "FORMULARY_REQUIRED" as const,
        rationaleEn: ANTIMICROBIAL_POLICY_RATIONALE,
      }
    : isObstetric
      ? {
          disposition: "EXCLUDED" as const,
          rationaleEn: "Obstetric-only agent; excluded from the pediatric platform selector unless a separate pediatric indication and product are reviewed.",
        }
      : DRUG_POLICY_OVERRIDES.get(entry.name) ?? {
          disposition: "MANUAL_NO_PROFILE" as const,
          rationaleEn: "Approved for manual documentation without a platform dose profile; no dose is inferred where the route-only model cannot preserve the required clinical context.",
        }
  const payload: PediatricDrugPolicyRulePayload = {
    kind: "PEDIATRIC_DRUG_POLICY",
    medicationKey: entry.name,
    labelEn: entry.name,
    labelBg: entry.name,
    inn: null,
    category: entry.category,
    disposition: override.disposition,
    reviewStatus: "APPROVED",
    rationaleEn: override.rationaleEn,
    rationaleBg: null,
  }
  return { payload, sourceRefs }
}

function parsedPediatricProfile(
  input: Omit<PediatricDrugProfileRulePayload, "availability" | "unit" | "routeUnits" | "profile"> & {
    availability?: PediatricDrugProfileRulePayload["availability"]
    profile: unknown
  },
): PediatricDrugProfileRulePayload {
  const parsed = validateClinicalRulePayload({
    availability: "AUTO",
    ...input,
    unit: null,
    routeUnits: {},
  })
  if (!parsed.valid || parsed.value.kind !== "PEDIATRIC_DRUG_PROFILE") {
    const detail = parsed.valid
      ? "Unexpected rule kind"
      : parsed.issues.map(issue => `${issue.field}: ${issue.message}`).join("; ")
    throw new Error(`Invalid pediatric platform profile for ${input.medicationKey}: ${detail}`)
  }
  return parsed.value
}

function pediatricAutofillSeeds(): ClinicalRuleSeed[] {
  const profiles: Array<{ payload: PediatricDrugProfileRulePayload; sourceRefs: string[] }> = [
    {
      payload: parsedPediatricProfile({
        kind: "PEDIATRIC_DRUG_PROFILE",
        medicationKey: "Ondansetron",
        labelEn: "Ondansetron",
        labelBg: "Ondansetron",
        inn: "ondansetron",
        category: "Acid suppression / aspiration prophylaxis / GI adjuncts",
        minimumAgeDays: 30.436875,
        maximumAgeDaysExclusive: PEDIATRIC_MAX_AGE_DAYS_EXCLUSIVE,
        profile: {
          routes: ["IV"],
          defaultRoute: "IV",
          min: 0,
          max: 4,
          step: 0.1,
          quickValues: [],
          unit: "mg",
          doseCalc: { perKg: 0.1, basis: "TBW", roundTo: 0.1, cap: 4 },
          concentrationOptions: ["2 mg/mL"],
          concentrationUnit: "MG_PER_ML",
          defaultConcentration: "2 mg/mL",
          hint: "Perioperative PONV draft; treatment evidence is absent below 2 years.",
        },
      }),
      sourceRefs: [...(PEDIATRIC_SOURCE_REFS.Ondansetron ?? [])],
    },
    {
      payload: parsedPediatricProfile({
        kind: "PEDIATRIC_DRUG_PROFILE",
        medicationKey: "Chlorphenamine / Chlorpheniramine",
        labelEn: "Chlorphenamine / Chlorpheniramine",
        labelBg: "Chlorphenamine / Chlorpheniramine",
        inn: "chlorphenamine",
        category: "Anaphylaxis / allergy adjuncts",
        minimumAgeDays: 30.436875,
        maximumAgeDaysExclusive: 365.2425,
        profile: {
          routes: ["IV", "IM", "SC"],
          defaultRoute: "IV",
          min: 0,
          max: 20,
          step: 0.1,
          quickValues: [],
          unit: "mg",
          doseCalc: { perKg: 0.25, basis: "TBW", roundTo: 0.1 },
          concentrationOptions: ["1 mg/mL", "10 mg/mL"],
          concentrationUnit: "MG_PER_ML",
          defaultConcentration: "1 mg/mL",
        },
      }),
      sourceRefs: [...(PEDIATRIC_SOURCE_REFS["Chlorphenamine / Chlorpheniramine"] ?? [])],
    },
    {
      payload: parsedPediatricProfile({
        kind: "PEDIATRIC_DRUG_PROFILE",
        medicationKey: "Chlorphenamine / Chlorpheniramine",
        labelEn: "Chlorphenamine / Chlorpheniramine",
        labelBg: "Chlorphenamine / Chlorpheniramine",
        inn: "chlorphenamine",
        category: "Anaphylaxis / allergy adjuncts",
        minimumAgeDays: 365.2425,
        maximumAgeDaysExclusive: PEDIATRIC_MAX_AGE_DAYS_EXCLUSIVE,
        profile: {
          routes: ["IV", "IM", "SC"],
          defaultRoute: "IV",
          min: 0,
          max: 20,
          step: 0.1,
          quickValues: [],
          unit: "mg",
          doseCalc: { perKg: 0.2, basis: "TBW", roundTo: 0.1 },
          concentrationOptions: ["10 mg/mL"],
          concentrationUnit: "MG_PER_ML",
          defaultConcentration: "10 mg/mL",
        },
      }),
      sourceRefs: [...(PEDIATRIC_SOURCE_REFS["Chlorphenamine / Chlorpheniramine"] ?? [])],
    },
  ]
  return profiles
}

function parsedPediatricFluidProfile(
  input: Omit<PediatricFluidProfileRulePayload, "unit" | "routeUnits" | "profile"> & {
    profile: unknown
  },
): PediatricFluidProfileRulePayload {
  const parsed = validateClinicalRulePayload({ ...input, unit: null, routeUnits: {} })
  if (!parsed.valid || parsed.value.kind !== "PEDIATRIC_FLUID_PROFILE") {
    const detail = parsed.valid
      ? "Unexpected rule kind"
      : parsed.issues.map(issue => `${issue.field}: ${issue.message}`).join("; ")
    throw new Error(`Invalid pediatric platform fluid profile for ${input.itemKey}: ${detail}`)
  }
  return parsed.value
}

/**
 * The pediatric fluid draft is a selector contract, not a product-specific
 * dosing protocol. It keeps the catalog's bag-entry surface intact while
 * adding the reviewed Rate mode. Only maintenance-compatible crystalloids
 * carry a 4/2/1 calculation marker; special fluids remain manual in Rate mode
 * and blood products remain volume-only.
 */
function pediatricFluidSeeds(): ClinicalRuleSeed[] {
  return FLUID_CATALOG.map(entry => {
    const identity = {
      name: entry.name,
      category: entry.category,
      concentration: entry.profile.defaultConcentration,
    }
    const bloodProduct = isBloodProductFluid(identity)
    const maintenanceCompatible = isMaintenanceCompatibleFluid(identity)
    const payload = parsedPediatricFluidProfile({
      kind: "PEDIATRIC_FLUID_PROFILE",
      itemKey: entry.name,
      labelEn: entry.name,
      labelBg: entry.name,
      category: entry.category,
      minimumAgeDays: 0,
      maximumAgeDaysExclusive: PEDIATRIC_MAX_AGE_DAYS_EXCLUSIVE,
      profile: {
        ...entry.profile,
        fluidEntryModes: bloodProduct ? ["VOLUME"] : ["VOLUME", "RATE"],
        defaultFluidEntryMode: bloodProduct ? "VOLUME" : "RATE",
        ...(bloodProduct
          ? {}
          : {
              fluidRate: {
                ...FLUID_RATE_SLIDER,
                ...(maintenanceCompatible
                  ? { calculation: "HOLLIDAY_SEGAR_4_2_1" as const }
                  : {}),
              },
            }),
      },
    })
    return {
      payload,
      sourceRefs: maintenanceCompatible
        ? [PEDIATRIC_SOURCE_REFERENCES.NICE_NG29.url]
        : [],
    }
  })
}

// checkedSeed lived here as a validating constructor, but every seed builder
// now calls validateClinicalRulePayload inline (policySeedForDrug,
// pediatricAutofillSeeds, pediatricFluidSeeds), so nothing referenced it. The
// validation itself is unaffected -- this was a superseded helper, not a gap.

export function createLosporPediatricPlatformDraft(): PlatformClinicalDraft {
  const drugPolicies = DRUG_CATALOG.map(policySeedForDrug)
  const rules = [
    ...drugPolicies,
    ...pediatricAutofillSeeds(),
    ...createPediatricInfusionProfileSeeds(),
    ...pediatricFluidSeeds(),
  ]
  const pending = drugPolicies.filter(seed =>
    seed.payload.kind === "PEDIATRIC_DRUG_POLICY"
    && seed.payload.reviewStatus !== "APPROVED",
  ).length
  return {
    id: "lospor-pediatrics-v1",
    key: LOSPOR_PEDIATRIC_RULESET_KEY,
    name: LOSPOR_PEDIATRIC_RULESET_NAME,
    description: "Platform-wide pediatric drug, infusion and fluid rules. Drug runtime profiles are emitted only when the route-only model can preserve the approved constraints; other drugs remain safely manual, local-formulary, schema-blocked or excluded as reviewed. The infusion matrix covers every canonical infusion with age/weight-specific AUTO, MANUAL, LOCAL or HIDDEN behavior. Fluid profiles preserve the canonical bag surface and add the approved pediatric Rate behavior. Institution and personal rulesets may override the platform layer through the normal hierarchy.",
    clinicalMode: "PEDIATRIC",
    version: LOSPOR_PEDIATRIC_RULESET_VERSION,
    publishable: pending === 0,
    blockers: pending === 0
      ? []
      : [`${pending} pediatric drug policies still require clinical governance approval`],
    rules,
  }
}

/**
 * Full pediatric v2 snapshot. Unlike v1, every canonical drug is represented
 * only by executable PEDIATRIC_DRUG_PROFILE bands. AUTO, MANUAL, LOCAL and
 * HIDDEN are therefore edited through the same route/concentration/dose
 * surface, and legacy policy/dose rows cannot diverge from the runtime model.
 * Pediatric infusion and fluid behavior is copied unchanged from v1.
 */
export function createLosporPediatricV2Draft(): PlatformClinicalDraft {
  const sourceRefsByMedication = new Map(
    DRUG_CATALOG.map(entry => {
      const policy = policySeedForDrug(entry)
      return [entry.name, policy.sourceRefs] as const
    }),
  )
  const drugProfiles = createPediatricDrugProfileV2Payloads().map(payload => ({
    payload,
    sourceRefs: [...(sourceRefsByMedication.get(payload.medicationKey) ?? [])],
  }))
  return {
    id: "lospor-pediatrics-v2",
    key: LOSPOR_PEDIATRIC_RULESET_KEY,
    name: "LOSPOR pediatric drugs profile",
    description: "Platform-wide pediatric drug, infusion and fluid rules using one full drug-profile model. Every canonical drug has editable AUTO, MANUAL, LOCAL or HIDDEN age/weight bands with the same routes, concentration/formulation controls, quick-dose pills, slider and direct-entry behavior used by adult profiles. The approved pediatric infusion matrix and fluid entry/rate behavior are preserved unchanged from v1. Institution and personal rulesets may override the platform layer through the normal hierarchy.",
    clinicalMode: "PEDIATRIC",
    version: LOSPOR_PEDIATRIC_V2_RULESET_VERSION,
    publishable: true,
    blockers: [],
    rules: [
      ...drugProfiles,
      ...createPediatricInfusionProfileSeeds(),
      ...pediatricFluidSeeds(),
    ],
  }
}

type LocalAnaestheticRouteSetting = {
  concentrationOptions?: string[]
  defaultConcentration?: string
  formulationOptions?: LocalAnaestheticFormulation[]
  defaultFormulation?: LocalAnaestheticFormulation
}

/**
 * Baricity for a neuraxial block is not only a manufactured product attribute:
 * the anaesthetist routinely compounds it at the bedside (glucose to make a
 * solution hyperbaric, sterile water to make it hypobaric), often off-label.
 * Every local anaesthetic therefore offers all three, and the register records
 * what was actually given rather than restricting it to licensed presentations.
 * Isobaric is preselected because it is the unmodified solution.
 */
const NEURAXIAL_BARICITY = {
  formulationOptions: ["HYPOBARIC", "ISOBARIC", "HYPERBARIC"] as LocalAnaestheticFormulation[],
  defaultFormulation: "ISOBARIC" as LocalAnaestheticFormulation,
} satisfies LocalAnaestheticRouteSetting

const LOCAL_ANAESTHETIC_V2: Readonly<Record<
  string,
  { routes: Readonly<Record<string, LocalAnaestheticRouteSetting>>; sourceRefs: readonly string[] }
>> = {
  "Lidocaine": {
    routes: {
      INFILTRATION: { defaultConcentration: "0.5%" },
      EPIDURAL: { defaultConcentration: "1%" },
      INTRATHECAL: {
        concentrationOptions: ["5%"],
        defaultConcentration: "5%",
        ...NEURAXIAL_BARICITY,
      },
      PERINEURAL: { defaultConcentration: "1%" },
    },
    sourceRefs: [
      "https://www.medicines.org.uk/emc/product/15149/smpc",
      "https://labeling.pfizer.com/ShowLabeling.aspx?format=PDF&id=5361",
    ],
  },
  "Bupivacaine": {
    routes: {
      INFILTRATION: { defaultConcentration: "0.25%" },
      EPIDURAL: { defaultConcentration: "0.25%" },
      INTRATHECAL: {
        concentrationOptions: ["0.5%"],
        defaultConcentration: "0.5%",
        ...NEURAXIAL_BARICITY,
      },
      PERINEURAL: { defaultConcentration: "0.25%" },
    },
    sourceRefs: [
      "https://www.medicines.org.uk/emc/product/5763/smpc",
      "https://www.medicines.org.uk/emc/product/11160/smpc",
    ],
  },
  "Levobupivacaine": {
    routes: {
      INFILTRATION: { defaultConcentration: "0.25%" },
      EPIDURAL: { defaultConcentration: "0.25%" },
      INTRATHECAL: {
        concentrationOptions: ["0.5%"],
        defaultConcentration: "0.5%",
        ...NEURAXIAL_BARICITY,
      },
      PERINEURAL: { defaultConcentration: "0.25%" },
    },
    sourceRefs: [
      "https://www.medicines.org.uk/emc/product/13643/smpc",
      "https://sps.nhs.uk/articles/levobupivacaine-informing-intrathecal-risk-assessment/",
    ],
  },
  "Ropivacaine": {
    routes: {
      INFILTRATION: { defaultConcentration: "0.2%" },
      EPIDURAL: { defaultConcentration: "0.2%" },
      // Intrathecal ropivacaine is off-label, but it is used. Omitting
      // concentrationOptions inherits the catalog list, so the quick pills mirror
      // the epidural route exactly; "other" still allows any entered strength.
      INTRATHECAL: { defaultConcentration: "0.2%", ...NEURAXIAL_BARICITY },
      PERINEURAL: { defaultConcentration: "0.2%" },
    },
    sourceRefs: [
      "https://www.medicines.org.uk/emc/product/1497/smpc",
      "https://sps.nhs.uk/articles/ropivacaine-informing-intrathecal-risk-assessment/",
    ],
  },
  "Mepivacaine": {
    routes: {
      INFILTRATION: { defaultConcentration: "1%" },
      EPIDURAL: { defaultConcentration: "1%" },
      // Same as ropivacaine: off-label intrathecal use is recorded, and the quick
      // pills mirror the epidural route by inheriting the catalog concentrations.
      INTRATHECAL: { defaultConcentration: "1%", ...NEURAXIAL_BARICITY },
      PERINEURAL: { defaultConcentration: "1%" },
    },
    sourceRefs: [
      "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=643a8a85-e7c6-4f09-a179-0a8e63de1bac&type=display",
    ],
  },
  "Prilocaine": {
    routes: {
      IV: { defaultConcentration: "0.5%" },
      INFILTRATION: { defaultConcentration: "0.5%" },
      EPIDURAL: { defaultConcentration: "0.5%" },
      INTRATHECAL: {
        concentrationOptions: ["2%"],
        defaultConcentration: "2%",
        ...NEURAXIAL_BARICITY,
      },
      PERINEURAL: { defaultConcentration: "0.5%" },
    },
    sourceRefs: [
      "https://www.medicines.org.uk/emc/product/870/smpc",
      "https://www.medicines.org.uk/emc/product/15160/smpc",
    ],
  },
  "Chloroprocaine": {
    routes: {
      INFILTRATION: { defaultConcentration: "2%" },
      EPIDURAL: { defaultConcentration: "2%" },
      INTRATHECAL: {
        concentrationOptions: ["1%"],
        defaultConcentration: "1%",
        ...NEURAXIAL_BARICITY,
      },
      PERINEURAL: { defaultConcentration: "2%" },
    },
    sourceRefs: [
      "https://www.medicines.org.uk/emc/product/15158/smpc",
      "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4305ab6b-6038-9daa-e063-6294a90a018e",
    ],
  },
  "Tetracaine / Amethocaine": {
    routes: {
      INTRATHECAL: {
        concentrationOptions: ["1%"],
        defaultConcentration: "1%",
        ...NEURAXIAL_BARICITY,
      },
    },
    sourceRefs: [
      "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=2b3349c1-bd02-4442-9bf0-40a654bb8a80",
    ],
  },
}

function cloneRouteMode(mode: RouteMode): RouteMode {
  return {
    ...mode,
    quickValues: [...mode.quickValues],
    variableStep: mode.variableStep?.map(item => ({ ...item })),
    doseCalc: mode.doseCalc ? { ...mode.doseCalc } : undefined,
    concentrationOptions: mode.concentrationOptions ? [...mode.concentrationOptions] : undefined,
    formulationOptions: mode.formulationOptions ? [...mode.formulationOptions] : undefined,
    prepStrength: mode.prepStrength ? { ...mode.prepStrength } : undefined,
  }
}

function routeModeFromProfile(profile: DoseProfile, route: string): RouteMode {
  const existing = profile.routeModes?.[route]
  if (existing) return cloneRouteMode(existing)
  if (profile.min == null || profile.max == null || !profile.unit) {
    throw new Error(`Adult local-anaesthetic profile has no complete surface for ${route}`)
  }
  return {
    mode: profile.mode,
    min: profile.min,
    max: profile.max,
    step: profile.step ?? profile.variableStep?.[0]?.step ?? 1,
    variableStep: profile.variableStep?.map(item => ({ ...item })),
    quickValues: [...profile.quickValues],
    unit: profile.unit,
    weightBasis: profile.weightBasis,
    doseCalc: profile.doseCalcByRoute?.[route]
      ? { ...profile.doseCalcByRoute[route] }
      : profile.doseCalc
        ? { ...profile.doseCalc }
        : undefined,
    concentrationOptions: profile.concentrationOptions
      ? [...profile.concentrationOptions]
      : undefined,
    concentrationUnit: profile.concentrationUnit,
    defaultConcentration: profile.defaultConcentration,
    suggestedConcentration: profile.suggestedConcentration,
    formulationOptions: profile.formulationOptions
      ? [...profile.formulationOptions]
      : undefined,
    defaultFormulation: profile.defaultFormulation,
    suggestedVolume: profile.suggestedVolumeByRoute?.[route] ?? profile.suggestedVolume,
    suggestedRate: profile.suggestedRate,
    prepStrength: profile.prepStrength ? { ...profile.prepStrength } : undefined,
  }
}

function withAdultLocalAnaestheticV2(
  payload: AdultDoseProfileRulePayload,
): AdultDoseProfileRulePayload {
  const policy = LOCAL_ANAESTHETIC_V2[payload.itemKey]
  if (!policy) return payload
  const routeModes = Object.fromEntries(payload.profile.routes.map(route => {
    const base = routeModeFromProfile(payload.profile, route)
    const setting = policy.routes[route]
    if (!setting || (!base.concentrationOptions && !setting.concentrationOptions)) {
      return [route, base]
    }
    return [route, {
      ...base,
      concentrationOptions: setting.concentrationOptions
        ? [...setting.concentrationOptions]
        : base.concentrationOptions,
      concentrationUnit: "PERCENT",
      defaultConcentration: setting.defaultConcentration,
      suggestedConcentration: undefined,
      formulationOptions: setting.formulationOptions
        ? [...setting.formulationOptions]
        : undefined,
      defaultFormulation: setting.defaultFormulation,
    } satisfies RouteMode]
  }))
  const candidate = {
    ...payload,
    profile: {
      ...payload.profile,
      routeModes,
      concentrationOptions: undefined,
      concentrationUnit: undefined,
      defaultConcentration: undefined,
      suggestedConcentration: undefined,
      formulationOptions: undefined,
      defaultFormulation: undefined,
    },
  }
  const parsed = validateClinicalRulePayload(candidate)
  if (!parsed.valid || parsed.value.kind !== "ADULT_DRUG_PROFILE") {
    const detail = parsed.valid
      ? "Unexpected rule kind"
      : parsed.issues.map(issue => `${issue.field}: ${issue.message}`).join("; ")
    throw new Error(`Invalid adult local-anaesthetic v2 profile for ${payload.itemKey}: ${detail}`)
  }
  return parsed.value
}

export function createLosporAdultV2Draft(): PlatformClinicalDraft {
  const rules = createLosporAdultRulePayloads().map(payload => {
    // Deliberately bolus profiles only. Local anaesthetics also exist as
    // ADULT_INFUSION_PROFILE rules with neuraxial routes, but those must NOT get
    // baricity pills: intrathecal infusions are not run with hyperbaric solutions,
    // so offering the choice there would be clinically wrong, not merely noisy.
    const next = payload.kind === "ADULT_DRUG_PROFILE"
      ? withAdultLocalAnaestheticV2(payload)
      : payload
    return {
      payload: next,
      sourceRefs: next.kind === "ADULT_DRUG_PROFILE"
        ? [...(LOCAL_ANAESTHETIC_V2[next.itemKey]?.sourceRefs ?? [])]
        : [],
    }
  })
  return {
    id: "lospor-adults-v2",
    key: LOSPOR_ADULT_RULESET_KEY,
    name: "LOSPOR adult drugs profile",
    description: "Full adult snapshot preserving v1 selector behaviour while adding explicit percent "
      + "concentration units and route defaults. Concentration and baricity stay independent pills "
      + "because the anaesthetist compounds baricity at the bedside; every neuraxial local anaesthetic "
      + "offers hypobaric, isobaric and hyperbaric with isobaric preselected, and intrathecal quick "
      + "concentrations mirror the epidural route. Off-label neuraxial use is recorded rather than "
      + "blocked, and any strength outside the pills can still be entered under \"other\".",
    clinicalMode: "ADULT",
    version: LOSPOR_ADULT_V2_RULESET_VERSION,
    publishable: true,
    blockers: [],
    rules,
  }
}

export function clinicalDraftRuleKeys(draft: PlatformClinicalDraft): string[] {
  return draft.rules.map(rule => clinicalRuleKey(rule.payload))
}
