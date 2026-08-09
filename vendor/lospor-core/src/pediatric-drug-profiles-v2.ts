import {
  DRUG_CATALOG,
  parseDoseProfile,
  type DoseCalc,
  type DoseProfile,
  type DoseProfileInput,
  type DrugCatalogEntry,
  type RouteModeInput,
} from "./catalog"
import {
  validateClinicalRulePayload,
  type DrugProfileAvailability,
  type PediatricDrugProfileRulePayload,
} from "./clinical-rules"

const DAY = 1
const WEEK = 7 * DAY
const MONTH = 30.436875 * DAY
const YEAR = 365.2425 * DAY

export const PEDIATRIC_DRUG_PROFILE_END_DAYS = 18 * YEAR

type BandSeed = {
  availability: DrugProfileAvailability
  minimumAgeDays?: number
  maximumAgeDaysExclusive?: number
  minimumWeightKg?: number | null
  minimumWeightInclusive?: boolean
  maximumWeightKg?: number | null
  maximumWeightInclusive?: boolean
  manualUnit?: string | null
  profile?: DoseProfile | DoseProfileInput | null
}

type SimpleSurface = {
  routes: string[]
  unit: string
  max: number
  step: number
  quickValues?: number[]
  perKg?: number
  flat?: number
  basis?: "TBW" | "IBW" | "BSA_M2"
  roundTo?: number
  cap?: number
  concentrationOptions?: string[]
  concentrationUnit?: string
  defaultConcentration?: string
  hint?: string
}

type RouteSurface = {
  routes: string[]
  unit: string
  max: number
  step: number
  quickValues?: number[]
  calculation?: DoseCalc
  concentrationOptions?: string[]
  concentrationUnit?: string
  defaultConcentration?: string
}

const LOCAL_DRUGS = new Set([
  "Alteplase",
  "Amikacin",
  "Amoxicillin-clavulanate",
  "Ampicillin",
  "Ampicillin-sulbactam",
  "Anidulafungin",
  "Azithromycin",
  "Aztreonam",
  "Bivalirudin",
  "Caspofungin",
  "Cefepime",
  "Cefotaxime",
  "Cefotetan",
  "Ceftaroline",
  "Ceftazidime",
  "Ceftriaxone",
  "Ciprofloxacin",
  "Clindamycin",
  "Daptomycin",
  "Diltiazem",
  "Doxycycline",
  "Ertapenem",
  "Esmolol",
  "Flucloxacillin",
  "Fluconazole",
  "Gentamicin",
  "Imipenem-cilastatin",
  "Levofloxacin",
  "Levosimendan",
  "Linezolid",
  "Meropenem",
  "Metronidazole",
  "Micafungin",
  "Moxifloxacin",
  "Nafcillin",
  "Nefopam",
  "Oxacillin",
  "Pipecuronium",
  "Piperacillin-tazobactam",
  "Potassium phosphate",
  "Prothrombin complex concentrate 4-factor",
  "Sodium phosphate",
  "Teicoplanin",
  "Tenecteplase",
  "Terlipressin",
  "Tigecycline",
  "Tobramycin",
  "Vancomycin",
  "Voriconazole",
])

const MANUAL_DRUGS = new Set([
  "Acetylcysteine",
  "Activated factor VII / Eptacog alfa",
  "Aminophylline",
  "Amiodarone",
  "Bupivacaine",
  "Buprenorphine",
  "Calcium chloride",
  "Calcium gluconate",
  "Carbetocin",
  "Carboprost",
  "Chloroprocaine",
  "Cyclizine",
  "Desmopressin",
  "Dexmedetomidine",
  "Diazepam",
  "Digoxin",
  "Haloperidol",
  "Lornoxicam",
  "Methylergometrine",
  "Misoprostol",
  "Nitroglycerin / Glyceryl trinitrate",
  "Norepinephrine / Noradrenaline",
  "Oxytocin",
  "Potassium chloride",
  "Prilocaine",
  "Protamine",
  "Regular insulin / Actrapid",
  "Remimazolam",
  "Tenoxicam",
  "Unfractionated heparin",
  "Vasopressin",
  "Vitamin K / Phytomenadione",
])

const HIDDEN_DRUGS = new Set([
  "Butorphanol",
  "Dexketoprofen",
  "Hyoscine butylbromide",
])

const ACTUAL_WEIGHT_DRUGS = new Set([
  "Epinephrine / Adrenaline",
  "Hydroxocobalamin",
  "Milrinone",
  "Naloxone",
])

function simpleSurface(input: SimpleSurface): DoseProfile {
  return parseDoseProfile("Pediatric drug", "bolus", {
    min: 0,
    max: input.max,
    step: input.step,
    quickValues: input.quickValues ?? [],
    unit: input.unit,
    routes: input.routes,
    defaultRoute: input.routes[0],
    weightBasis: input.perKg == null ? "none" : (input.basis ?? "IBW"),
    doseCalc: input.perKg == null && input.flat == null
      ? undefined
      : {
          ...(input.perKg == null ? {} : { perKg: input.perKg }),
          ...(input.flat == null ? {} : { flat: input.flat }),
          basis: input.perKg == null ? undefined : (input.basis ?? "IBW"),
          roundTo: input.roundTo ?? input.step,
          cap: input.cap,
        },
    concentrationOptions: input.concentrationOptions,
    concentrationUnit: input.concentrationUnit,
    defaultConcentration: input.defaultConcentration,
    hint: input.hint,
  })
}

function routeSurface(routes: Record<string, RouteSurface>, defaultRoute?: string): DoseProfile {
  const routeNames = Object.keys(routes)
  const routeModes = Object.fromEntries(Object.entries(routes).map(([route, surface]) => [
    route,
    {
      min: 0,
      max: surface.max,
      step: surface.step,
      quickValues: surface.quickValues ?? [],
      unit: surface.unit,
      weightBasis: surface.calculation?.basis ?? "none",
      doseCalc: surface.calculation,
      concentrationOptions: surface.concentrationOptions,
      concentrationUnit: surface.concentrationUnit,
      defaultConcentration: surface.defaultConcentration,
    } satisfies RouteModeInput,
  ]))
  return parseDoseProfile("Pediatric drug", "bolus", {
    routes: routeNames,
    defaultRoute: defaultRoute ?? routeNames[0],
    routeModes,
  })
}

function withoutSuggestions(profile: DoseProfile): DoseProfile {
  return {
    ...profile,
    quickValues: [],
    doseCalc: undefined,
    doseCalcByRoute: {},
    routeModes: profile.routeModes
      ? Object.fromEntries(Object.entries(profile.routeModes).map(([route, mode]) => [route, {
          ...mode,
          quickValues: [],
          doseCalc: undefined,
        }]))
      : undefined,
  }
}

function adultSurface(entry: DrugCatalogEntry): DoseProfile {
  return parseDoseProfile(entry.name, "bolus", entry.profile)
}

function approvedAutoSurface(entry: DrugCatalogEntry): DoseProfile {
  const exact = PEDIATRIC_V2_EXACT_AUTO_SURFACES[entry.name]
  if (exact) return exact()
  // All entries reaching this fallback were approved as AUTO. Retain the
  // hand-tailored selector surface from the canonical adult catalog while the
  // pediatric age/weight envelope remains independently editable.
  return adultSurface(entry)
}

export const PEDIATRIC_V2_EXACT_AUTO_SURFACES: Readonly<Record<string, () => DoseProfile>> = {
  "Propofol": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 400, step: 1, quickValues: [5, 10, 20, 50, 100, 200, 400], perKg: 2.5, roundTo: 1 }),
  "Etomidate": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 60, step: 0.1, quickValues: [0.5, 1, 2, 5, 10, 15, 20, 30], perKg: 0.3, roundTo: 0.1, cap: 60 }),
  "Ketamine": () => routeSurface({
    IV: { routes: ["IV"], unit: "mg", max: 250, step: 1, quickValues: [5, 10, 20, 50, 100, 200], calculation: { perKg: 2, basis: "IBW", roundTo: 1 } },
    IM: { routes: ["IM"], unit: "mg", max: 500, step: 1, quickValues: [5, 10, 20, 50, 100, 200, 400], calculation: { perKg: 4, basis: "IBW", roundTo: 1 } },
    IN: { routes: ["IN"], unit: "mg", max: 200, step: 1, quickValues: [5, 10, 20, 50, 100, 200], calculation: { perKg: 2, basis: "IBW", roundTo: 1 } },
    PO: { routes: ["PO"], unit: "mg", max: 400, step: 1, quickValues: [5, 10, 20, 50, 100, 200, 400], calculation: { perKg: 5, basis: "IBW", roundTo: 1 } },
  }),
  "Methohexital": () => routeSurface({
    IM: { routes: ["IM"], unit: "mg", max: 500, step: 1, quickValues: [10, 20, 25, 50, 75, 100, 150, 200, 300, 400, 500], calculation: { perKg: 6.6, basis: "IBW", roundTo: 1, cap: 500 } },
    PR: { routes: ["PR"], unit: "mg", max: 500, step: 5, quickValues: [25, 50, 100, 150, 200, 250, 300, 400, 500], calculation: { perKg: 25, basis: "IBW", roundTo: 5, cap: 500 } },
    IV: { routes: ["IV"], unit: "mg", max: 500, step: 1 },
  }, "IM"),
  "Midazolam": () => routeSurface({
    IV: { routes: ["IV"], unit: "mg", max: 10, step: 0.1, quickValues: [0.1, 0.25, 0.5, 1, 2, 3, 5, 7.5, 10], calculation: { perKg: 0.05, basis: "IBW", roundTo: 0.1, cap: 10 } },
    IM: { routes: ["IM"], unit: "mg", max: 10, step: 0.1, quickValues: [0.1, 0.25, 0.5, 1, 2, 3, 5, 7.5, 10], calculation: { perKg: 0.1, basis: "IBW", roundTo: 0.1, cap: 10 } },
    IN: { routes: ["IN"], unit: "mg", max: 10, step: 0.1, quickValues: [0.1, 0.25, 0.5, 1, 2, 3, 5, 7.5, 10], calculation: { perKg: 0.2, basis: "IBW", roundTo: 0.1, cap: 10 } },
    PO: { routes: ["PO"], unit: "mg", max: 20, step: 0.5, quickValues: [1, 2, 2.5, 5, 7.5, 10, 15, 20], calculation: { perKg: 0.5, basis: "TBW", roundTo: 0.5, cap: 20 } },
  }),
  "Lorazepam": () => routeSurface({
    IV: { routes: ["IV"], unit: "mg", max: 4, step: 0.1, quickValues: [0.25, 0.5, 1, 2, 3, 4], calculation: { perKg: 0.1, basis: "IBW", roundTo: 0.1, cap: 4 } },
    INTRAOSSEOUS: { routes: ["INTRAOSSEOUS"], unit: "mg", max: 4, step: 0.1, quickValues: [0.25, 0.5, 1, 2, 3, 4], calculation: { perKg: 0.1, basis: "IBW", roundTo: 0.1, cap: 4 } },
    PO: { routes: ["PO"], unit: "mg", max: 4, step: 0.1, quickValues: [0.25, 0.5, 1, 2, 3, 4] },
    IM: { routes: ["IM"], unit: "mg", max: 4, step: 0.1, quickValues: [0.25, 0.5, 1, 2, 3, 4] },
  }),
  "Clonidine": () => routeSurface({
    PO: { routes: ["PO"], unit: "mcg", max: 300, step: 5, quickValues: [25, 50, 75, 100, 150, 200], calculation: { perKg: 4, basis: "IBW", roundTo: 5, cap: 200 } },
    EPIDURAL: { routes: ["EPIDURAL"], unit: "mcg", max: 150, step: 1, quickValues: [10, 20, 25, 50, 75, 100, 150], calculation: { perKg: 1, basis: "IBW", roundTo: 1, cap: 150 } },
    INTRATHECAL: { routes: ["INTRATHECAL"], unit: "mcg", max: 150, step: 1, quickValues: [10, 20, 25, 50, 75, 100, 150], calculation: { perKg: 1, basis: "IBW", roundTo: 1, cap: 150 } },
    IV: { routes: ["IV"], unit: "mcg", max: 150, step: 1 },
  }, "PO"),
  "Esketamine": () => routeSurface({
    IV: { routes: ["IV"], unit: "mg", max: 250, step: 1, quickValues: [5, 10, 20, 50, 100, 200], calculation: { perKg: 0.5, basis: "IBW", roundTo: 1 } },
    IM: { routes: ["IM"], unit: "mg", max: 250, step: 1, quickValues: [5, 10, 20, 50, 100, 200], calculation: { perKg: 2, basis: "IBW", roundTo: 1 } },
  }),
  "Thiopental / Thiopentone": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 1000, step: 1, quickValues: [25, 50, 100, 200, 300, 400, 500], perKg: 4, roundTo: 1 }),
  "Fentanyl": () => routeSurface({
    IV: { routes: ["IV"], unit: "mcg", max: 500, step: 1, quickValues: [5, 10, 20, 25, 50, 100, 200], calculation: { perKg: 1, basis: "IBW", roundTo: 1, cap: 100 } },
    IM: { routes: ["IM"], unit: "mcg", max: 500, step: 1, quickValues: [5, 10, 20, 25, 50, 100, 200], calculation: { perKg: 1, basis: "IBW", roundTo: 1, cap: 100 } },
    IN: { routes: ["IN"], unit: "mcg", max: 100, step: 1, quickValues: [5, 10, 15, 25, 50, 75, 100], calculation: { perKg: 1.5, basis: "IBW", roundTo: 1, cap: 100 } },
  }),
  "Sufentanil": () => simpleSurface({ routes: ["IV"], unit: "mcg", max: 50, step: 1, quickValues: [1, 2, 5, 10, 20, 25, 50], perKg: 0.2, roundTo: 1, cap: 50 }),
  "Remifentanil": () => simpleSurface({ routes: ["IV"], unit: "mcg", max: 100, step: 1, quickValues: [5, 10, 20, 25, 50, 75, 100], perKg: 1, roundTo: 1, cap: 100 }),
  "Alfentanil": () => simpleSurface({ routes: ["IV"], unit: "mcg", max: 1500, step: 10, quickValues: [50, 100, 250, 500, 1000], perKg: 10, roundTo: 10, concentrationOptions: ["500 mcg/mL"], concentrationUnit: "MCG_PER_ML", defaultConcentration: "500 mcg/mL" }),
  "Hydromorphone": () => simpleSurface({ routes: ["IV", "IM"], unit: "mg", max: 4, step: 0.01, quickValues: [0.05, 0.1, 0.2, 0.4, 0.5, 1, 2], perKg: 0.015, roundTo: 0.01, cap: 0.5 }),
  "Morphine": () => simpleSurface({ routes: ["IV", "IM"], unit: "mg", max: 10, step: 0.1, quickValues: [0.5, 1, 2, 2.5, 5, 7.5, 10], perKg: 0.1, roundTo: 0.1, cap: 10 }),
  "Oxycodone": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 5, step: 0.1, quickValues: [0.5, 1, 2, 2.5, 5], perKg: 0.05, roundTo: 0.1, cap: 5 }),
  "Methadone": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 20, step: 0.1, quickValues: [0.5, 1, 2, 2.5, 5, 10, 15, 20], perKg: 0.1, roundTo: 0.1, cap: 10 }),
  "Pethidine / Meperidine": () => routeSurface({
    IV: { routes: ["IV"], unit: "mg", max: 50, step: 0.5, quickValues: [2.5, 5, 10, 20, 25, 50], calculation: { perKg: 0.5, basis: "IBW", roundTo: 0.5, cap: 25 } },
    IM: { routes: ["IM"], unit: "mg", max: 50, step: 0.5, quickValues: [2.5, 5, 10, 20, 25, 50], calculation: { perKg: 1, basis: "IBW", roundTo: 0.5, cap: 50 } },
  }),
  "Nalbuphine": () => simpleSurface({ routes: ["IV", "IM", "SC"], unit: "mg", max: 20, step: 0.1, quickValues: [0.5, 1, 2, 2.5, 5, 10, 20], perKg: 0.1, roundTo: 0.1, cap: 20 }),
  "Diamorphine": () => simpleSurface({ routes: ["IN"], unit: "mg", max: 10, step: 0.1, quickValues: [1, 2, 3, 4, 5], perKg: 0.1, roundTo: 0.1, cap: 5 }),
  "Tramadol": () => simpleSurface({ routes: ["IV", "IM", "SC"], unit: "mg", max: 100, step: 1, quickValues: [5, 10, 20, 25, 50, 75, 100], perKg: 1, roundTo: 1, cap: 100 }),
  "Paracetamol / Acetaminophen": () => routeSurface({
    PO: { routes: ["PO"], unit: "mg", max: 1000, step: 10, quickValues: [50, 100, 250, 500, 750, 1000], calculation: { perKg: 15, basis: "IBW", roundTo: 10, cap: 1000 } },
    PR: { routes: ["PR"], unit: "mg", max: 1000, step: 10, quickValues: [60, 125, 250, 500, 1000], calculation: { perKg: 20, basis: "IBW", roundTo: 10, cap: 1000 } },
    IV: { routes: ["IV"], unit: "mg", max: 1000, step: 10, quickValues: [50, 100, 250, 500, 750, 1000], calculation: { perKg: 15, basis: "IBW", roundTo: 10, cap: 1000 } },
  }),
  "Metamizole": () => simpleSurface({ routes: ["PO", "IM", "IV"], unit: "mg", max: 2500, step: 10, quickValues: [100, 250, 500, 750, 1000, 1500, 2500], perKg: 15, roundTo: 10, cap: 1000 }),
  "Ketorolac": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 30, step: 0.5, quickValues: [2.5, 5, 7.5, 10, 15, 20, 30], perKg: 0.5, roundTo: 0.5, cap: 30 }),
  "Diclofenac": () => simpleSurface({ routes: ["PO", "PR"], unit: "mg", max: 100, step: 1, quickValues: [5, 10, 12.5, 25, 50], perKg: 1, roundTo: 1, cap: 50 }),
  "Ibuprofen": () => simpleSurface({ routes: ["IV", "PO", "PR"], unit: "mg", max: 400, step: 5, quickValues: [50, 100, 200, 400], perKg: 10, roundTo: 5, cap: 400 }),
  "Ketoprofen": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 100, step: 1, quickValues: [5, 10, 25, 50, 75, 100], perKg: 1, roundTo: 1, cap: 100 }),
  "Parecoxib": () => simpleSurface({ routes: ["IV", "IM"], unit: "mg", max: 40, step: 1, quickValues: [5, 10, 20, 40], perKg: 1, roundTo: 1, cap: 40 }),
  "Magnesium sulfate": () => simpleSurface({ routes: ["IV", "INTRAOSSEOUS"], unit: "mg", max: 4000, step: 50, quickValues: [250, 500, 1000, 1500, 2000, 4000], perKg: 30, roundTo: 50, cap: 2000 }),
  "Levobupivacaine": () => routeSurface({
    INFILTRATION: { routes: ["INFILTRATION"], unit: "mL", max: 40, step: 0.1, quickValues: [0.5, 1, 2, 5, 10, 20, 40], calculation: { perKg: 0.2, basis: "IBW", roundTo: 0.1 }, concentrationOptions: ["0.25%", "0.5%"], concentrationUnit: "PERCENT", defaultConcentration: "0.25%" },
    PERINEURAL: { routes: ["PERINEURAL"], unit: "mL", max: 40, step: 0.1, quickValues: [0.5, 1, 2, 5, 10, 20, 40], calculation: { perKg: 0.2, basis: "IBW", roundTo: 0.1 }, concentrationOptions: ["0.25%", "0.5%"], concentrationUnit: "PERCENT", defaultConcentration: "0.25%" },
    EPIDURAL: { routes: ["EPIDURAL"], unit: "mL", max: 40, step: 0.1, quickValues: [0.5, 1, 2, 5, 10, 20, 40], calculation: { perKg: 0.5, basis: "IBW", roundTo: 0.1 }, concentrationOptions: ["0.125%", "0.25%", "0.5%"], concentrationUnit: "PERCENT", defaultConcentration: "0.25%" },
    INTRATHECAL: { routes: ["INTRATHECAL"], unit: "mL", max: 5, step: 0.1, concentrationOptions: ["0.5%"], concentrationUnit: "PERCENT", defaultConcentration: "0.5%" },
  }),
  "Lidocaine": () => routeSurface({
    IV: { routes: ["IV"], unit: "mg", max: 500, step: 1, quickValues: [5, 10, 20, 25, 50, 75, 100, 150, 200], calculation: { perKg: 1, basis: "IBW", roundTo: 1, cap: 100 } },
    INTRAOSSEOUS: { routes: ["INTRAOSSEOUS"], unit: "mg", max: 500, step: 1, quickValues: [5, 10, 20, 25, 50, 75, 100, 150, 200], calculation: { perKg: 1, basis: "IBW", roundTo: 1, cap: 100 } },
    INFILTRATION: { routes: ["INFILTRATION"], unit: "mL", max: 50, step: 0.1, quickValues: [0.5, 1, 2, 5, 10, 20, 40, 50], calculation: { perKg: 0.2, basis: "IBW", roundTo: 0.1 }, concentrationOptions: ["0.5%", "1%"], concentrationUnit: "PERCENT", defaultConcentration: "0.5%" },
    PERINEURAL: { routes: ["PERINEURAL"], unit: "mL", max: 50, step: 0.1, quickValues: [0.5, 1, 2, 5, 10, 20, 40, 50], calculation: { perKg: 0.2, basis: "IBW", roundTo: 0.1 }, concentrationOptions: ["0.5%", "1%"], concentrationUnit: "PERCENT", defaultConcentration: "1%" },
    EPIDURAL: { routes: ["EPIDURAL"], unit: "mL", max: 50, step: 0.1, quickValues: [0.5, 1, 2, 5, 10, 20, 40, 50], calculation: { perKg: 0.3, basis: "IBW", roundTo: 0.1 }, concentrationOptions: ["0.5%", "1%", "2%"], concentrationUnit: "PERCENT", defaultConcentration: "1%" },
    INTRATHECAL: { routes: ["INTRATHECAL"], unit: "mL", max: 5, step: 0.1, concentrationOptions: ["1.5%", "5%"], concentrationUnit: "PERCENT", defaultConcentration: "1.5%" },
  }),
  "Mepivacaine": () => routeSurface({
    INFILTRATION: { routes: ["INFILTRATION"], unit: "mL", max: 60, step: 0.1, quickValues: [1, 2, 5, 8, 10], calculation: { perKg: 0.3, basis: "IBW", roundTo: 0.1 }, concentrationOptions: ["1%", "1.5%", "2%"], concentrationUnit: "PERCENT", defaultConcentration: "1%" },
    PERINEURAL: { routes: ["PERINEURAL"], unit: "mL", max: 60, step: 0.1, quickValues: [1, 2, 5, 8, 10], calculation: { perKg: 0.3, basis: "IBW", roundTo: 0.1 }, concentrationOptions: ["1%", "1.5%", "2%"], concentrationUnit: "PERCENT", defaultConcentration: "1%" },
    EPIDURAL: { routes: ["EPIDURAL"], unit: "mL", max: 60, step: 0.1, quickValues: [1, 2, 5, 8, 10], calculation: { perKg: 0.5, basis: "IBW", roundTo: 0.1 }, concentrationOptions: ["1%", "1.5%", "2%"], concentrationUnit: "PERCENT", defaultConcentration: "1%" },
  }),
  "Ropivacaine": () => routeSurface({
    INFILTRATION: { routes: ["INFILTRATION"], unit: "mL", max: 50, step: 0.1, quickValues: [0.5, 1, 2, 5, 10, 20, 40, 50], calculation: { perKg: 0.25, basis: "IBW", roundTo: 0.1 }, concentrationOptions: ["0.2%", "0.5%", "0.75%"], concentrationUnit: "PERCENT", defaultConcentration: "0.2%" },
    PERINEURAL: { routes: ["PERINEURAL"], unit: "mL", max: 50, step: 0.1, quickValues: [0.5, 1, 2, 5, 10, 20, 40, 50], calculation: { perKg: 0.25, basis: "IBW", roundTo: 0.1 }, concentrationOptions: ["0.2%", "0.5%", "0.75%"], concentrationUnit: "PERCENT", defaultConcentration: "0.2%" },
    EPIDURAL: { routes: ["EPIDURAL"], unit: "mL", max: 50, step: 0.1, quickValues: [0.5, 1, 2, 5, 10, 20, 40, 50], calculation: { perKg: 0.5, basis: "IBW", roundTo: 0.1 }, concentrationOptions: ["0.2%", "0.5%", "0.75%"], concentrationUnit: "PERCENT", defaultConcentration: "0.2%" },
  }),
  "Vecuronium": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 10, step: 0.1, quickValues: [0.5, 1, 2, 5, 10], perKg: 0.1, roundTo: 0.1, cap: 10 }),
  "Succinylcholine / Suxamethonium": () => routeSurface({
    IV: { routes: ["IV"], unit: "mg", max: 150, step: 1, quickValues: [5, 10, 20, 50, 100, 150], calculation: { perKg: 1, basis: "TBW", roundTo: 1, cap: 150 } },
    IM: { routes: ["IM"], unit: "mg", max: 150, step: 1, quickValues: [5, 10, 20, 50, 100, 150], calculation: { perKg: 4, basis: "TBW", roundTo: 1, cap: 150 } },
  }),
  "Rocuronium": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 100, step: 0.1, quickValues: [1, 2, 5, 10, 20, 50, 100], perKg: 0.6, roundTo: 0.1, cap: 100 }),
  "Pancuronium": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 10, step: 0.1, quickValues: [0.2, 0.5, 1, 2, 5, 10], perKg: 0.08, roundTo: 0.1, cap: 10 }),
  "Mivacurium": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 20, step: 0.1, quickValues: [0.2, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20], perKg: 0.2, roundTo: 0.1 }),
  "Cisatracurium": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 20, step: 0.1, quickValues: [0.5, 1, 2, 5, 10, 20], perKg: 0.15, roundTo: 0.1, cap: 20, concentrationOptions: ["2 mg/mL", "5 mg/mL"], concentrationUnit: "MG_PER_ML", defaultConcentration: "2 mg/mL" }),
  "Atracurium": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 50, step: 0.1, quickValues: [1, 2, 5, 10, 20], perKg: 0.5, roundTo: 0.1, concentrationOptions: ["10 mg/mL"], concentrationUnit: "MG_PER_ML", defaultConcentration: "10 mg/mL" }),
  "Sugammadex": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 800, step: 10, quickValues: [10, 20, 50, 100, 200, 400, 800], perKg: 2, basis: "TBW", roundTo: 10 }),
  "Neostigmine": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 5, step: 0.1, quickValues: [0.1, 0.2, 0.5, 1, 1.5, 2, 2.5], perKg: 0.05, roundTo: 0.1, cap: 2.5 }),
  "Glycopyrrolate": () => routeSurface({
    IV: { routes: ["IV"], unit: "mg", max: 1, step: 0.01, quickValues: [0.05, 0.1, 0.2, 0.4, 0.6, 1], calculation: { perKg: 0.01, basis: "IBW", roundTo: 0.01 } },
    IM: { routes: ["IM"], unit: "mg", max: 1, step: 0.01, quickValues: [0.05, 0.1, 0.2, 0.4, 0.6, 1], calculation: { perKg: 0.005, basis: "IBW", roundTo: 0.01, cap: 0.2 } },
  }),
  "Atropine": () => simpleSurface({ routes: ["IV", "IM", "SC"], unit: "mg", max: 3, step: 0.01, quickValues: [0.1, 0.2, 0.3, 0.5, 0.6], perKg: 0.01, roundTo: 0.01, cap: 0.6, concentrationOptions: ["0.1 mg/mL", "0.6 mg/mL", "1 mg/mL"], concentrationUnit: "MG_PER_ML", defaultConcentration: "0.1 mg/mL" }),
  "Scopolamine / Hyoscine": () => simpleSurface({ routes: ["IM", "SC"], unit: "mg", max: 0.6, step: 0.01, quickValues: [0.05, 0.1, 0.2, 0.3, 0.6], perKg: 0.015, roundTo: 0.01, cap: 0.6 }),
  "Phenylephrine": () => simpleSurface({ routes: ["IV"], unit: "mcg", max: 100, step: 1, quickValues: [5, 10, 20, 25, 50, 100], perKg: 1, roundTo: 1, cap: 100 }),
  "Epinephrine / Adrenaline": () => simpleSurface({ routes: ["IV", "INTRAOSSEOUS"], unit: "mcg", max: 1000, step: 10, quickValues: [10, 50, 100, 250, 500, 1000], perKg: 10, basis: "TBW", roundTo: 10, cap: 1000 }),
  "Ephedrine": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 30, step: 0.5, quickValues: [0.5, 1, 2, 3, 5, 10], perKg: 0.1, roundTo: 0.5, cap: 10 }),
  "Metaraminol": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 2, step: 0.01, quickValues: [0.05, 0.1, 0.2, 0.3, 0.5, 1, 2], perKg: 0.01, roundTo: 0.01, cap: 0.5 }),
  "Methylene blue": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 200, step: 0.1, quickValues: [1, 2, 5, 10, 20, 25, 50, 75, 100, 150, 200], perKg: 1, roundTo: 0.1 }),
  "Hydroxocobalamin": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 5000, step: 50, quickValues: [350, 700, 1400, 2100, 2800, 3500, 5000], perKg: 70, basis: "TBW", roundTo: 50, cap: 5000 }),
  "Milrinone": () => simpleSurface({ routes: ["IV"], unit: "mcg", max: 5000, step: 10, quickValues: [50, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000], perKg: 50, basis: "TBW", roundTo: 10 }),
  "Glucagon": () => simpleSurface({ routes: ["IM", "SC"], unit: "mg", max: 5, step: 0.1, quickValues: [0.5, 1, 2, 5], flat: 1, roundTo: 0.1 }),
  "Propranolol": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 3, step: 0.01, quickValues: [0.05, 0.1, 0.2, 0.5, 1, 2, 3], perKg: 0.01, roundTo: 0.01, cap: 3 }),
  "Sildenafil": () => simpleSurface({ routes: ["PO"], unit: "mg", max: 20, step: 1, quickValues: [5, 10, 20], flat: 20, roundTo: 1, cap: 20 }),
  "Verapamil": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 5, step: 0.1, quickValues: [0.5, 1, 2, 2.5, 5], perKg: 0.1, roundTo: 0.1, cap: 5 }),
  "Adenosine": () => simpleSurface({ routes: ["IV", "INTRAOSSEOUS"], unit: "mg", max: 12, step: 0.1, quickValues: [0.5, 1, 2, 3, 6, 12], perKg: 0.1, basis: "TBW", roundTo: 0.1, cap: 6, concentrationOptions: ["3 mg/mL"], concentrationUnit: "MG_PER_ML", defaultConcentration: "3 mg/mL" }),
  "Ondansetron": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 4, step: 0.1, quickValues: [0.5, 1, 2, 4], perKg: 0.1, roundTo: 0.1, cap: 4, concentrationOptions: ["2 mg/mL"], concentrationUnit: "MG_PER_ML", defaultConcentration: "2 mg/mL" }),
  "Dexamethasone": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 20, step: 0.1, quickValues: [1, 2, 4, 5], perKg: 0.15, roundTo: 0.1, cap: 5 }),
  "Metoclopramide": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 10, step: 0.1, quickValues: [1, 2, 2.5, 5, 10], perKg: 0.1, roundTo: 0.1, cap: 10 }),
  "Granisetron": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 1, step: 0.01, quickValues: [0.1, 0.2, 0.4, 0.6, 1], perKg: 0.04, roundTo: 0.01, cap: 0.6 }),
  "Palonosetron": () => simpleSurface({ routes: ["IV"], unit: "mcg", max: 75, step: 1, quickValues: [5, 10, 20, 25, 50, 75], perKg: 1, roundTo: 1, cap: 75 }),
  "Tropisetron": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 2, step: 0.1, quickValues: [0.5, 1, 2], perKg: 0.1, roundTo: 0.1, cap: 2 }),
  "Dimenhydrinate": () => simpleSurface({ routes: ["IV", "IM", "PO"], unit: "mg", max: 50, step: 0.5, quickValues: [2.5, 5, 10, 12.5, 25], perKg: 0.5, roundTo: 0.5, cap: 25 }),
  "Fosaprepitant": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 150, step: 1, quickValues: [25, 50, 100, 115, 150], perKg: 4, roundTo: 1, cap: 150 }),
  "Octreotide": () => simpleSurface({ routes: ["IV", "SC"], unit: "mcg", max: 50, step: 1, quickValues: [1, 2, 5, 10, 20, 25, 50], perKg: 1, roundTo: 1, cap: 50 }),
  "Cefazolin": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 3000, step: 10, quickValues: [250, 500, 1000, 1500, 2000], perKg: 30, roundTo: 10, cap: 2000 }),
  "Cefuroxime": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 3000, step: 10, quickValues: [250, 500, 750, 1000, 1500], perKg: 50, roundTo: 10, cap: 1500 }),
  "Cefoxitin": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 4000, step: 10, quickValues: [250, 500, 1000, 2000], perKg: 40, roundTo: 10, cap: 2000 }),
  "Droperidol": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 2.5, step: 0.01, quickValues: [0.1, 0.25, 0.5, 0.625, 1.25], perKg: 0.01, roundTo: 0.01, cap: 1.25 }),
  "Furosemide": () => simpleSurface({ routes: ["IV", "IM"], unit: "mg", max: 100, step: 0.5, quickValues: [1, 2, 5, 10, 20, 40, 80], perKg: 1, roundTo: 0.5 }),
  "Galantamine": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 50, step: 0.1, quickValues: [0.5, 1, 2.5, 5, 10, 15, 20, 30], perKg: 0.28, roundTo: 0.1, cap: 15 }),
  "Hydralazine": () => simpleSurface({ routes: ["IV", "IM"], unit: "mg", max: 20, step: 0.1, quickValues: [0.5, 1, 2, 5, 10, 20], perKg: 0.1, roundTo: 0.1, cap: 20 }),
  "Labetalol": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 100, step: 0.1, quickValues: [0.5, 1, 2, 5, 10, 20, 40], perKg: 0.2, roundTo: 0.1, cap: 40 }),
  "Levetiracetam": () => simpleSurface({ routes: ["IV", "INTRAOSSEOUS"], unit: "mg", max: 4500, step: 10, quickValues: [100, 250, 500, 1000, 1500, 3000, 4500], perKg: 40, roundTo: 10, cap: 4500 }),
  "Methylprednisolone": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 1000, step: 1, quickValues: [5, 10, 20, 40, 60, 125, 250, 500, 1000], perKg: 1, roundTo: 1, cap: 60 }),
  "Metoprolol": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 15, step: 0.1, quickValues: [0.5, 1, 2, 2.5, 5], perKg: 0.1, roundTo: 0.1, cap: 5 }),
  "Naloxone": () => routeSurface({
    IV: { routes: ["IV"], unit: "mcg", max: 2000, step: 10, quickValues: [10, 20, 40, 100, 200, 400, 2000], calculation: { perKg: 2, basis: "TBW", roundTo: 10, cap: 200 } },
    IM: { routes: ["IM"], unit: "mcg", max: 2000, step: 10, quickValues: [10, 20, 40, 100, 200, 400, 2000], calculation: { perKg: 4, basis: "TBW", roundTo: 10, cap: 200 } },
  }),
  "Fibrinogen concentrate": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 8000, step: 100, quickValues: [500, 1000, 2000, 3000, 4000, 6000, 8000], perKg: 30, basis: "TBW", roundTo: 100 }),
  "Terbutaline": () => simpleSurface({ routes: ["SC"], unit: "mg", max: 0.3, step: 0.01, quickValues: [0.05, 0.1, 0.2, 0.25, 0.3], perKg: 0.01, roundTo: 0.01, cap: 0.3 }),
  "Hydrocortisone": () => simpleSurface({ routes: ["IV", "IM"], unit: "mg", max: 200, step: 5, quickValues: [25, 50, 100, 200], flat: 100, roundTo: 5, cap: 100 }),
  "Salbutamol / Albuterol": () => simpleSurface({ routes: ["INHALATION"], unit: "mg", max: 5, step: 0.5, quickValues: [2.5, 5], flat: 2.5, roundTo: 0.5, cap: 5 }),
  "Theophylline": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 500, step: 1, quickValues: [25, 50, 100, 200, 300, 400, 500], perKg: 4.5, roundTo: 1, cap: 500 }),
  "Flumazenil": () => simpleSurface({ routes: ["IV"], unit: "mcg", max: 1000, step: 10, quickValues: [10, 20, 50, 100, 200, 500, 1000], perKg: 10, roundTo: 10, cap: 200 }),
  "Chlorphenamine / Chlorpheniramine": () => simpleSurface({ routes: ["IV", "IM", "SC"], unit: "mg", max: 20, step: 0.1, quickValues: [2.5, 5, 10, 20], perKg: 0.2, roundTo: 0.1, cap: 20, concentrationOptions: ["10 mg/mL"], concentrationUnit: "MG_PER_ML", defaultConcentration: "10 mg/mL" }),
  "Sodium bicarbonate": () => simpleSurface({ routes: ["IV"], unit: "mEq", max: 50, step: 1, quickValues: [1, 2, 5, 10, 20, 25, 50], perKg: 1, roundTo: 1, cap: 50 }),
  "Sodium chloride hypertonic (3%)": () => simpleSurface({ routes: ["IV"], unit: "mL", max: 150, step: 1, quickValues: [5, 10, 20, 30, 50, 100, 150], perKg: 3, roundTo: 1, cap: 150 }),
  "Tetracaine / Amethocaine": () => routeSurface({
    TOPICAL: { routes: ["TOPICAL"], unit: "g", max: 1, step: 0.1, quickValues: [0.5, 1], calculation: { flat: 1, roundTo: 0.1 } },
    INTRATHECAL: { routes: ["INTRATHECAL"], unit: "mL", max: 5, step: 0.1, concentrationOptions: ["0.5%"], concentrationUnit: "PERCENT", defaultConcentration: "0.5%" },
  }),
  "Tranexamic acid": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 1000, step: 10, quickValues: [50, 100, 250, 500, 750, 1000], perKg: 10, roundTo: 10, cap: 1000 }),
  "Valproic acid": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 3000, step: 10, quickValues: [100, 250, 500, 1000, 1500, 2000, 3000], perKg: 20, roundTo: 10, cap: 3000 }),
  "Dantrolene": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 500, step: 0.5, quickValues: [5, 10, 20, 40, 60, 120, 240, 500], perKg: 2.5, basis: "TBW", roundTo: 0.5 }),
  "Physostigmine": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 0.5, step: 0.01, quickValues: [0.05, 0.1, 0.2, 0.5], perKg: 0.02, roundTo: 0.01, cap: 0.5 }),
  "Pralidoxime": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 2000, step: 50, quickValues: [250, 500, 1000, 1500, 2000], perKg: 25, roundTo: 50, cap: 2000 }),
  "Hyaluronidase": () => simpleSurface({ routes: ["SC", "IM", "INFILTRATION"], unit: "IU", max: 1500, step: 15, quickValues: [15, 150, 750, 1500], flat: 1500, roundTo: 15 }),
  "Phenobarbital": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 1000, step: 10, quickValues: [50, 100, 250, 500, 750, 1000], perKg: 20, roundTo: 10, cap: 1000 }),
  "Phenytoin": () => simpleSurface({ routes: ["IV"], unit: "mg", max: 1500, step: 10, quickValues: [50, 100, 250, 500, 750, 1000, 1500], perKg: 20, roundTo: 10, cap: 1500 }),
}

function availabilityFor(entry: DrugCatalogEntry): DrugProfileAvailability {
  if (HIDDEN_DRUGS.has(entry.name)) return "HIDDEN"
  if (LOCAL_DRUGS.has(entry.name)) return "LOCAL"
  if (MANUAL_DRUGS.has(entry.name)) return "MANUAL"
  return "AUTO"
}

function defaultBand(entry: DrugCatalogEntry): BandSeed {
  const availability = availabilityFor(entry)
  if (availability === "HIDDEN") return { availability, profile: null }
  if (availability === "LOCAL") {
    return {
      availability,
      manualUnit: adultSurface(entry).unit ?? "mg",
      profile: null,
    }
  }
  if (availability === "MANUAL") {
    return {
      availability,
      profile: withoutSuggestions(adultSurface(entry)),
    }
  }
  return {
    availability,
    minimumAgeDays: AUTO_MINIMUM_AGE_DAYS[entry.name] ?? 0,
    profile: approvedAutoSurface(entry),
  }
}

const AUTO_MINIMUM_AGE_DAYS: Readonly<Record<string, number>> = {
  "Alfentanil": 2 * YEAR,
  "Atracurium": MONTH,
  "Cisatracurium": MONTH,
  "Clonidine": YEAR,
  "Dexamethasone": 2 * YEAR,
  "Diamorphine": 2 * YEAR,
  "Dimenhydrinate": MONTH,
  "Droperidol": 2 * YEAR,
  "Etomidate": 6 * MONTH,
  "Fentanyl": YEAR,
  "Flumazenil": YEAR,
  "Fosaprepitant": 6 * MONTH,
  "Granisetron": 2 * YEAR,
  "Ibuprofen": 3 * MONTH,
  "Ketamine": 3 * MONTH,
  "Ketoprofen": YEAR,
  "Ketorolac": YEAR,
  "Levetiracetam": MONTH,
  "Levobupivacaine": 6 * MONTH,
  "Magnesium sulfate": 4 * WEEK,
  "Mepivacaine": YEAR,
  "Metaraminol": 4 * WEEK,
  "Methadone": MONTH,
  "Methylprednisolone": MONTH,
  "Metoclopramide": YEAR,
  "Metoprolol": YEAR,
  "Nalbuphine": 18 * MONTH,
  "Naloxone": 4 * WEEK,
  "Ondansetron": MONTH,
  "Oxycodone": 12 * YEAR,
  "Palonosetron": MONTH,
  "Parecoxib": 2 * YEAR,
  "Phenobarbital": 4 * WEEK,
  "Phenylephrine": 4 * WEEK,
  "Phenytoin": 4 * WEEK,
  "Propofol": MONTH,
  "Remifentanil": YEAR,
  "Scopolamine / Hyoscine": 4 * MONTH,
  "Sodium bicarbonate": 4 * WEEK,
  "Sodium chloride hypertonic (3%)": 4 * WEEK,
  "Sufentanil": MONTH,
  "Terbutaline": 2 * YEAR,
  "Theophylline": YEAR,
  "Tranexamic acid": 4 * WEEK,
  "Tropisetron": MONTH,
  "Valproic acid": 3 * YEAR,
  "Vecuronium": 4 * WEEK,
  "Verapamil": YEAR,
}

function specialBands(entry: DrugCatalogEntry): BandSeed[] | null {
  if (entry.name === "Chlorphenamine / Chlorpheniramine") {
    return [
      { availability: "MANUAL", maximumAgeDaysExclusive: MONTH, profile: withoutSuggestions(adultSurface(entry)) },
      {
        availability: "AUTO",
        minimumAgeDays: MONTH,
        maximumAgeDaysExclusive: YEAR,
        profile: simpleSurface({ routes: ["IV", "IM", "SC"], unit: "mg", max: 20, step: 0.1, quickValues: [2.5, 5, 10, 20], perKg: 0.25, roundTo: 0.1, cap: 20, concentrationOptions: ["1 mg/mL", "10 mg/mL"], concentrationUnit: "MG_PER_ML", defaultConcentration: "1 mg/mL" }),
      },
      { ...defaultBand(entry), minimumAgeDays: YEAR },
    ]
  }
  if (entry.name === "Fosaprepitant") {
    return [
      { availability: "MANUAL", maximumAgeDaysExclusive: 6 * MONTH, profile: withoutSuggestions(adultSurface(entry)) },
      { availability: "AUTO", minimumAgeDays: 6 * MONTH, maximumAgeDaysExclusive: 2 * YEAR, profile: simpleSurface({ routes: ["IV"], unit: "mg", max: 150, step: 1, quickValues: [25, 50, 100, 115, 150], perKg: 5, roundTo: 1, cap: 150 }) },
      { availability: "AUTO", minimumAgeDays: 2 * YEAR, maximumAgeDaysExclusive: 12 * YEAR, profile: PEDIATRIC_V2_EXACT_AUTO_SURFACES[entry.name]!() },
      { availability: "AUTO", minimumAgeDays: 12 * YEAR, profile: simpleSurface({ routes: ["IV"], unit: "mg", max: 150, step: 1, quickValues: [25, 50, 100, 115, 150], flat: 150, roundTo: 1, cap: 150 }) },
    ]
  }
  if (entry.name === "Glucagon") {
    const surface = (flat: number) => routeSurface({
      IM: { routes: ["IM"], unit: "mg", max: 5, step: 0.1, quickValues: [0.5, 1, 2, 5], calculation: { flat, roundTo: 0.1 } },
      SC: { routes: ["SC"], unit: "mg", max: 5, step: 0.1, quickValues: [0.5, 1, 2, 5], calculation: { flat, roundTo: 0.1 } },
      IV: { routes: ["IV"], unit: "mg", max: 5, step: 0.1, quickValues: [0.5, 1, 2, 5], calculation: { perKg: 0.05, basis: "IBW", roundTo: 0.1, cap: 5 } },
    })
    return [
      { availability: "AUTO", maximumWeightKg: 25, maximumWeightInclusive: false, profile: surface(0.5) },
      { availability: "AUTO", minimumWeightKg: 25, minimumWeightInclusive: true, profile: surface(1) },
    ]
  }
  if (entry.name === "Hydrocortisone") {
    return [
      { availability: "AUTO", maximumAgeDaysExclusive: YEAR, profile: simpleSurface({ routes: ["IV", "IM"], unit: "mg", max: 200, step: 5, quickValues: [25, 50, 100, 200], flat: 25, roundTo: 5, cap: 25 }) },
      { availability: "AUTO", minimumAgeDays: YEAR, maximumAgeDaysExclusive: 6 * YEAR, profile: simpleSurface({ routes: ["IV", "IM"], unit: "mg", max: 200, step: 5, quickValues: [25, 50, 100, 200], flat: 50, roundTo: 5, cap: 50 }) },
      { ...defaultBand(entry), minimumAgeDays: 6 * YEAR },
    ]
  }
  if (entry.name === "Ibuprofen") {
    const manual = withoutSuggestions(adultSurface(entry))
    return [
      { availability: "MANUAL", maximumAgeDaysExclusive: 3 * MONTH, profile: manual },
      { availability: "MANUAL", minimumAgeDays: 3 * MONTH, maximumWeightKg: 5, maximumWeightInclusive: true, profile: manual },
      { availability: "AUTO", minimumAgeDays: 3 * MONTH, maximumAgeDaysExclusive: 6 * MONTH, minimumWeightKg: 5, minimumWeightInclusive: false, profile: simpleSurface({ routes: ["IV", "PO", "PR"], unit: "mg", max: 400, step: 5, quickValues: [50, 100, 200, 400], perKg: 10, roundTo: 5, cap: 100 }) },
      { ...defaultBand(entry), minimumAgeDays: 6 * MONTH, minimumWeightKg: 5, minimumWeightInclusive: false },
    ]
  }
  if (entry.name === "Mivacurium") {
    return [
      { availability: "MANUAL", maximumAgeDaysExclusive: 2 * MONTH, profile: withoutSuggestions(adultSurface(entry)) },
      { availability: "AUTO", minimumAgeDays: 2 * MONTH, maximumAgeDaysExclusive: 7 * MONTH, profile: simpleSurface({ routes: ["IV"], unit: "mg", max: 20, step: 0.1, quickValues: [0.2, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20], perKg: 0.15, roundTo: 0.1 }) },
      { ...defaultBand(entry), minimumAgeDays: 7 * MONTH },
    ]
  }
  if (entry.name === "Morphine") {
    return [
      { availability: "AUTO", maximumAgeDaysExclusive: MONTH, profile: simpleSurface({ routes: ["IV"], unit: "mg", max: 1, step: 0.01, quickValues: [0.05, 0.1, 0.15, 0.2, 0.25, 0.5, 1], perKg: 0.025, roundTo: 0.01 }) },
      { availability: "AUTO", minimumAgeDays: MONTH, maximumAgeDaysExclusive: YEAR, profile: simpleSurface({ routes: ["IV"], unit: "mg", max: 2, step: 0.05, quickValues: [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2], perKg: 0.05, roundTo: 0.05 }) },
      { ...defaultBand(entry), minimumAgeDays: YEAR },
    ]
  }
  if (entry.name === "Pancuronium") {
    return [
      { availability: "AUTO", maximumAgeDaysExclusive: 4 * WEEK, profile: simpleSurface({ routes: ["IV"], unit: "mg", max: 10, step: 0.01, quickValues: [0.1, 0.2, 0.5, 1, 2, 5, 10], perKg: 0.04, roundTo: 0.01, cap: 10 }) },
      { ...defaultBand(entry), minimumAgeDays: 4 * WEEK },
    ]
  }
  if (entry.name === "Paracetamol / Acetaminophen") {
    const surface = (ivPerKg: number, roundTo: number) => routeSurface({
      PO: { routes: ["PO"], unit: "mg", max: 1000, step: roundTo, quickValues: [50, 100, 250, 500, 750, 1000], calculation: { perKg: 15, basis: "IBW", roundTo, cap: 1000 } },
      PR: { routes: ["PR"], unit: "mg", max: 1000, step: roundTo, quickValues: [60, 125, 250, 500, 1000], calculation: { perKg: 20, basis: "IBW", roundTo, cap: 1000 } },
      IV: { routes: ["IV"], unit: "mg", max: 1000, step: roundTo, quickValues: [50, 100, 250, 500, 750, 1000], calculation: { perKg: ivPerKg, basis: "IBW", roundTo, cap: 1000 } },
    })
    return [
      { availability: "AUTO", maximumWeightKg: 10, maximumWeightInclusive: false, profile: surface(7.5, 10) },
      { availability: "AUTO", minimumWeightKg: 10, minimumWeightInclusive: true, profile: surface(15, 50) },
    ]
  }
  if (entry.name === "Propranolol") {
    return [
      { availability: "AUTO", maximumAgeDaysExclusive: YEAR, profile: simpleSurface({ routes: ["IV"], unit: "mg", max: 3, step: 0.01, quickValues: [0.05, 0.1, 0.2, 0.5, 1], perKg: 0.01, roundTo: 0.01, cap: 1 }) },
      { ...defaultBand(entry), minimumAgeDays: YEAR },
    ]
  }
  if (entry.name === "Sildenafil") {
    return [
      { availability: "AUTO", minimumAgeDays: YEAR, maximumWeightKg: 20, maximumWeightInclusive: true, profile: simpleSurface({ routes: ["PO"], unit: "mg", max: 20, step: 1, quickValues: [5, 10, 20], flat: 10, roundTo: 1, cap: 10 }) },
      { availability: "AUTO", minimumAgeDays: YEAR, minimumWeightKg: 20, minimumWeightInclusive: false, profile: PEDIATRIC_V2_EXACT_AUTO_SURFACES[entry.name]!() },
    ]
  }
  if (entry.name === "Succinylcholine / Suxamethonium") {
    const infant = routeSurface({
      IV: { routes: ["IV"], unit: "mg", max: 150, step: 1, quickValues: [5, 10, 20, 50, 100, 150], calculation: { perKg: 2, basis: "TBW", roundTo: 1, cap: 150 } },
      IM: { routes: ["IM"], unit: "mg", max: 150, step: 1, quickValues: [5, 10, 20, 50, 100, 150], calculation: { perKg: 4, basis: "TBW", roundTo: 1, cap: 150 } },
    })
    return [
      { availability: "MANUAL", maximumAgeDaysExclusive: 4 * WEEK, profile: withoutSuggestions(adultSurface(entry)) },
      { availability: "AUTO", minimumAgeDays: 4 * WEEK, maximumAgeDaysExclusive: YEAR, profile: infant },
      { ...defaultBand(entry), minimumAgeDays: YEAR },
    ]
  }
  if (entry.name === "Terbutaline") {
    return [
      { availability: "MANUAL", maximumAgeDaysExclusive: 2 * YEAR, profile: withoutSuggestions(adultSurface(entry)) },
      { ...defaultBand(entry), minimumAgeDays: 2 * YEAR, maximumAgeDaysExclusive: 16 * YEAR },
      { availability: "AUTO", minimumAgeDays: 16 * YEAR, profile: simpleSurface({ routes: ["SC"], unit: "mg", max: 0.3, step: 0.01, quickValues: [0.05, 0.1, 0.2, 0.25, 0.3], flat: 0.25, roundTo: 0.01, cap: 0.25 }) },
    ]
  }
  if (entry.name === "Theophylline") {
    return [
      { availability: "HIDDEN", maximumAgeDaysExclusive: 6 * MONTH, profile: null },
      { availability: "MANUAL", minimumAgeDays: 6 * MONTH, maximumAgeDaysExclusive: YEAR, profile: withoutSuggestions(adultSurface(entry)) },
      { ...defaultBand(entry), minimumAgeDays: YEAR },
    ]
  }
  if (entry.name === "Daptomycin") {
    return [
      { availability: "HIDDEN", maximumAgeDaysExclusive: YEAR, profile: null },
      { availability: "LOCAL", minimumAgeDays: YEAR, manualUnit: "mg", profile: null },
    ]
  }
  if (entry.name === "Metoclopramide") {
    return [
      { availability: "HIDDEN", maximumAgeDaysExclusive: YEAR, profile: null },
      defaultBand(entry),
    ]
  }
  if (entry.name === "Metamizole") {
    return [
      { availability: "HIDDEN", maximumAgeDaysExclusive: 3 * MONTH, profile: null },
      {
        availability: "HIDDEN",
        minimumAgeDays: 3 * MONTH,
        maximumWeightKg: 5,
        maximumWeightInclusive: false,
        profile: null,
      },
      {
        ...defaultBand(entry),
        minimumAgeDays: 3 * MONTH,
        minimumWeightKg: 5,
        minimumWeightInclusive: true,
      },
    ]
  }
  if (entry.name === "Promethazine") {
    return [
      { availability: "HIDDEN", maximumAgeDaysExclusive: 2 * YEAR, profile: null },
      { availability: "MANUAL", minimumAgeDays: 2 * YEAR, profile: withoutSuggestions(adultSurface(entry)) },
    ]
  }
  if (entry.name === "Tramadol") {
    return [
      { availability: "HIDDEN", maximumAgeDaysExclusive: YEAR, profile: null },
      { ...defaultBand(entry), minimumAgeDays: YEAR },
    ]
  }
  if (entry.name === "Tetracaine / Amethocaine") {
    return [
      { availability: "HIDDEN", maximumAgeDaysExclusive: MONTH, profile: null },
      { ...defaultBand(entry), minimumAgeDays: MONTH },
    ]
  }
  if (entry.name === "Verapamil") {
    return [
      { availability: "HIDDEN", maximumAgeDaysExclusive: YEAR, profile: null },
      defaultBand(entry),
    ]
  }
  return null
}

function profilePayload(entry: DrugCatalogEntry, band: BandSeed): PediatricDrugProfileRulePayload {
  const candidate = {
    kind: "PEDIATRIC_DRUG_PROFILE",
    medicationKey: entry.name,
    labelEn: entry.name,
    labelBg: entry.name,
    inn: null,
    category: entry.category,
    availability: band.availability,
    minimumAgeDays: band.minimumAgeDays ?? 0,
    maximumAgeDaysExclusive: band.maximumAgeDaysExclusive ?? PEDIATRIC_DRUG_PROFILE_END_DAYS,
    minimumWeightKg: band.minimumWeightKg ?? null,
    minimumWeightInclusive: band.minimumWeightInclusive ?? true,
    maximumWeightKg: band.maximumWeightKg ?? null,
    maximumWeightInclusive: band.maximumWeightInclusive ?? false,
    manualUnit: band.manualUnit ?? band.profile?.unit ?? null,
    profile: band.profile ?? null,
    unit: null,
    routeUnits: {},
  }
  const parsed = validateClinicalRulePayload(candidate)
  if (!parsed.valid || parsed.value.kind !== "PEDIATRIC_DRUG_PROFILE") {
    const detail = parsed.valid
      ? "Unexpected rule kind"
      : parsed.issues.map(issue => `${issue.field}: ${issue.message}`).join("; ")
    throw new Error(`Invalid pediatric v2 drug profile for ${entry.name}: ${detail}`)
  }
  return parsed.value
}

export function createPediatricDrugProfileV2Payloads(): PediatricDrugProfileRulePayload[] {
  return DRUG_CATALOG.flatMap(entry => (
    specialBands(entry) ?? [defaultBand(entry)]
  ).map(band => profilePayload(entry, band)))
}

export const PEDIATRIC_V2_LOCAL_DRUGS = LOCAL_DRUGS
export const PEDIATRIC_V2_MANUAL_DRUGS = MANUAL_DRUGS
export const PEDIATRIC_V2_HIDDEN_DRUGS = HIDDEN_DRUGS
export const PEDIATRIC_V2_ACTUAL_WEIGHT_DRUGS = ACTUAL_WEIGHT_DRUGS
