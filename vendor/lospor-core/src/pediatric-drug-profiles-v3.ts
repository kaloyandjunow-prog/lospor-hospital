import {
  DRUG_CATALOG,
  parseDoseProfile,
  type DoseCalc,
  type DoseProfile,
  type DrugCatalogEntry,
  type RouteModeInput,
} from "./catalog"
import { normalizeAdministrationRoute } from "./clinical-rule-vocabulary"
import type { PediatricDrugProfileRulePayload } from "./clinical-rules"
import {
  adultSurface,
  defaultBand,
  MONTH,
  profilePayload,
  specialBands,
  withoutSuggestions,
  YEAR,
  type BandSeed,
} from "./pediatric-drug-profiles-v2"

/**
 * Paediatric v3 (2026-10-18): every band that offered no suggestion now
 * suggests a dose, has a slider range and quick pills; antimicrobials get a
 * meaningful range only. Bands with no paediatric use (by licence or safety)
 * are hidden -- for children only, the adult rules are untouched.
 *
 * v2 is released and fingerprinted, so nothing here reaches it: the v2 builder
 * never calls this file.
 */

type RoutePatch = {
  calc?: DoseCalc
  max?: number
  step?: number
  quick?: number[]
  concentrationOptions?: string[]
  defaultConcentration?: string
}

/** A dose per kilogram of ideal weight, never above `cap`. */
const kg = (perKg: number, roundTo: number, cap?: number, basis: DoseCalc["basis"] = "IBW"): DoseCalc => ({
  perKg,
  basis,
  roundTo,
  ...(cap == null ? {} : { cap }),
  capAtActualWeight: true,
})

const flat = (dose: number, roundTo: number): DoseCalc => ({ flat: dose, roundTo })

/**
 * The surface with each route patched. Every route gets its own mode, and
 * anything the adult surface suggested (volume, hint, concentration) is
 * dropped: a child's suggestion comes only from the patch. `"*"` patches every
 * route; `drop` removes routes not used in children.
 */
function tuned(base: DoseProfile, patches: Record<string, RoutePatch>, drop: readonly string[] = []): DoseProfile {
  // The catalogue names routes for display ("IT", "PD"); patches use the canonical names.
  const canonical = (route: string) => normalizeAdministrationRoute(route) ?? route
  const routes = base.routes.filter(route => !drop.includes(canonical(route)))
  const routeModes = Object.fromEntries(routes.map(route => {
    const own = base.routeModes?.[route]
    const patch = { ...patches["*"], ...patches[canonical(route)] }
    // An unpatched route keeps the paediatric calculation it already had.
    const calc = patch.calc ?? (own ? own.doseCalc : base.doseCalcByRoute?.[route] ?? base.doseCalc)
    const mode: RouteModeInput = {
      mode: own?.mode ?? base.mode,
      min: 0,
      max: patch.max ?? own?.max ?? base.max ?? 0,
      step: patch.step ?? own?.step ?? base.step ?? 1,
      quickValues: patch.quick ?? own?.quickValues ?? base.quickValues,
      unit: own?.unit ?? base.unit ?? "",
      weightBasis: calc?.perKg != null ? (calc.basis ?? "IBW") : "none",
      doseCalc: calc,
      concentrationOptions: patch.concentrationOptions ?? own?.concentrationOptions ?? base.concentrationOptions,
      concentrationUnit: own?.concentrationUnit ?? base.concentrationUnit,
      defaultConcentration: patch.defaultConcentration ?? own?.defaultConcentration ?? base.defaultConcentration,
      formulationOptions: own?.formulationOptions ?? base.formulationOptions,
      defaultFormulation: own?.defaultFormulation ?? base.defaultFormulation,
    }
    return [route, mode]
  }))
  const defaultRoute = base.defaultRoute && routes.includes(base.defaultRoute) ? base.defaultRoute : routes[0]
  return parseDoseProfile("Pediatric drug", "bolus", { routes, defaultRoute, routeModes })
}

/** The adult surface with nothing suggested: the starting point for a drug that had no paediatric profile. */
const blank = (entry: DrugCatalogEntry) => withoutSuggestions(adultSurface(entry))

const auto = (band: BandSeed, profile: DoseProfile): BandSeed => ({ ...band, availability: "AUTO", profile })
const hidden = (band: BandSeed): BandSeed => ({ ...band, availability: "HIDDEN", manualUnit: null, profile: null })
const profileOf = (band: BandSeed, entry: DrugCatalogEntry) => (band.profile as DoseProfile | null | undefined) ?? blank(entry)

/** Every band of the drug suggesting from the same patches. */
const allAuto = (patches: Record<string, RoutePatch>, drop: readonly string[] = []) =>
  (entry: DrugCatalogEntry, bands: BandSeed[]) => bands.map(band => auto(band, tuned(profileOf(band, entry), patches, drop)))

/** Only the band starting at `minimumAgeDays` (0 = the first) changes. */
const bandFrom = (minimumAgeDays: number, change: (band: BandSeed, entry: DrugCatalogEntry) => BandSeed) =>
  (entry: DrugCatalogEntry, bands: BandSeed[]) => bands.map(band => (band.minimumAgeDays ?? 0) === minimumAgeDays ? change(band, entry) : band)

/** Hidden under 12 years; from 12, the patches. For drugs with no use in younger children. */
const fromTwelve = (patches: Record<string, RoutePatch>) =>
  (entry: DrugCatalogEntry, bands: BandSeed[]): BandSeed[] => {
    const base = bands[0]!
    return [
      { ...hidden(base), maximumAgeDaysExclusive: 12 * YEAR },
      { ...auto(base, tuned(profileOf(base, entry), patches)), minimumAgeDays: 12 * YEAR },
    ]
  }

/** Range only: entered by hand, never suggested (antimicrobials). */
const rangeOnly = (max: number) =>
  (entry: DrugCatalogEntry, bands: BandSeed[]) => bands.map(band => (
    band.availability === "HIDDEN"
      ? band
      : { ...band, availability: "MANUAL" as const, manualUnit: null, profile: tuned(blank(entry), { "*": { max, step: max > 1000 ? 5 : 1, quick: [] } }) }
  ))

/**
 * Spinal doses fall with size: 1 mg/kg under 5 kg, 0.4 mg/kg to 15 kg and
 * 0.3 mg/kg above, as mL of 0.5% solution (ESRA/ASRA paediatric doses).
 */
const SPINAL_WEIGHT_BANDS = [
  { band: { maximumWeightKg: 5, maximumWeightInclusive: false }, mlPerKg: 0.2 },
  { band: { minimumWeightKg: 5, minimumWeightInclusive: true, maximumWeightKg: 15, maximumWeightInclusive: true }, mlPerKg: 0.08 },
  { band: { minimumWeightKg: 15, minimumWeightInclusive: false }, mlPerKg: 0.06 },
] as const

const SPINAL_QUICK = [0.2, 0.5, 1, 1.5, 2]
const spinal = (mlPerKg: number): RoutePatch => ({ calc: kg(mlPerKg, 0.05, 3), max: 3, step: 0.05, quick: SPINAL_QUICK })

/** Each band split by weight, so the spinal dose follows the child's size. */
const bySpinalWeight = (patches: Record<string, RoutePatch>, drop: readonly string[] = []) =>
  (entry: DrugCatalogEntry, bands: BandSeed[]) => bands.flatMap(band => band.availability === "HIDDEN"
    ? [band]
    : SPINAL_WEIGHT_BANDS.map(weight => auto(
        { ...band, ...weight.band },
        tuned(profileOf(band, entry), { ...patches, INTRATHECAL: { ...patches.INTRATHECAL, ...spinal(weight.mlPerKg) } }, drop),
      )))

const LA_QUICK = [0.5, 1, 2, 5, 10, 20]
const block: RoutePatch = { calc: kg(0.2, 0.1, 20), max: 40, step: 0.1, quick: LA_QUICK }
const caudal: RoutePatch = { calc: kg(0.5, 0.1, 20), max: 20, step: 0.1, quick: LA_QUICK }

const ANTIMICROBIAL_MAXIMUM_MG: Readonly<Record<string, number>> = {
  "Piperacillin-tazobactam": 4500,
  "Ceftriaxone": 4000,
  "Cefotaxime": 3000,
  "Ampicillin-sulbactam": 3000,
  "Amoxicillin-clavulanate": 2200,
  "Cefotetan": 2000,
  "Ceftazidime": 2000,
  "Cefepime": 2000,
  "Ampicillin": 2000,
  "Flucloxacillin": 2000,
  "Oxacillin": 2000,
  "Nafcillin": 2000,
  "Vancomycin": 2000,
  "Meropenem": 2000,
  "Aztreonam": 2000,
  "Amikacin": 1500,
  "Metronidazole": 1500,
  "Ertapenem": 1000,
  "Imipenem-cilastatin": 1000,
  "Daptomycin": 1000,
  "Clindamycin": 900,
  "Teicoplanin": 800,
  "Fluconazole": 800,
  "Levofloxacin": 750,
  "Ceftaroline": 600,
  "Linezolid": 600,
  "Voriconazole": 600,
  "Gentamicin": 500,
  "Tobramycin": 500,
  "Azithromycin": 500,
  "Ciprofloxacin": 400,
  "Moxifloxacin": 400,
  "Doxycycline": 200,
  "Anidulafungin": 200,
  "Micafungin": 200,
  "Tigecycline": 100,
  "Caspofungin": 70,
}

type Override = (entry: DrugCatalogEntry, bands: BandSeed[]) => BandSeed[]

const V3_OVERRIDES: Readonly<Record<string, Override>> = {
  ...Object.fromEntries(Object.entries(ANTIMICROBIAL_MAXIMUM_MG).map(([name, max]) => [name, rangeOnly(max)])),

  // Sedation and anaesthesia
  "Methohexital": allAuto({ IV: { calc: kg(1.5, 1, 120), max: 200, quick: [5, 10, 20, 50, 100] } }),
  // IM diazepam is absorbed erratically; not offered for children.
  "Diazepam": allAuto({
    IV: { calc: kg(0.1, 0.1, 10), max: 10, step: 0.1, quick: [0.5, 1, 2, 5, 10] },
    PO: { calc: kg(0.2, 0.5, 10), max: 10, step: 0.5, quick: [1, 2, 5, 10] },
  }, ["IM"]),
  "Remimazolam": allAuto({ IV: { calc: kg(0.3, 0.1, 20), max: 20, step: 0.1, quick: [1, 2, 5, 10, 20] } }),
  "Dexmedetomidine": allAuto({
    IV: { calc: kg(0.5, 0.5, 50), max: 100, step: 0.5, quick: [2, 5, 10, 20, 50] },
    EPIDURAL: { calc: kg(1, 0.5, 50), max: 50, step: 0.5, quick: [2, 5, 10, 20, 50] },
  }),
  "Clonidine": allAuto({ IV: { calc: kg(1, 1, 150), quick: [10, 20, 25, 50, 75, 100] } }),
  "Lorazepam": allAuto({
    PO: { calc: kg(0.05, 0.1, 2) },
    IM: { calc: kg(0.05, 0.1, 2) },
  }),
  "Haloperidol": allAuto({ IV: { calc: kg(0.025, 0.05, 1), max: 2.5, step: 0.05, quick: [0.25, 0.5, 1, 2] } }),
  "Promethazine": bandFrom(2 * YEAR, (band, entry) => auto(band, tuned(profileOf(band, entry), {
    "*": { calc: kg(0.25, 0.5, 12.5), max: 25, step: 0.5, quick: [2.5, 5, 10, 12.5, 25] },
  }))),
  "Buprenorphine": allAuto({
    IV: { calc: kg(3, 1, 300), max: 300, step: 1, quick: [10, 20, 50, 100, 200, 300] },
    IM: { calc: kg(3, 1, 300), max: 300, step: 1, quick: [10, 20, 50, 100, 200, 300] },
    SL: { calc: kg(4, 10, 400), max: 400, step: 10, quick: [50, 100, 200, 400] },
  }),
  "Pipecuronium": allAuto({ IV: { calc: kg(0.07, 0.1, 8), max: 10, step: 0.1, quick: [0.5, 1, 2, 4, 8] } }),
  "Succinylcholine / Suxamethonium": bandFrom(0, (band, entry) => auto(band, tuned(profileOf(band, entry), {
    IV: { calc: kg(2, 0.5, undefined, "TBW"), max: 20, step: 0.5, quick: [2, 4, 6, 8, 10] },
  }))),
  "Mivacurium": bandFrom(0, (band, entry) => auto(band, tuned(profileOf(band, entry), {
    IV: { calc: kg(0.2, 0.05), max: 2, step: 0.05, quick: [0.5, 1, 1.5, 2] },
  }))),

  // Pain. Ibuprofen is not for pain under 3 months; NSAIDs below are for adolescents.
  "Ibuprofen": (entry, bands) => bands.map(band => {
    if ((band.minimumAgeDays ?? 0) === 0) return hidden(band)
    if (band.availability !== "MANUAL") return band
    return auto(band, tuned(profileOf(band, entry), { "*": { calc: kg(5, 1, 50), max: 50, step: 1, quick: [10, 20, 25, 50] } }))
  }),
  "Lornoxicam": fromTwelve({ IV: { calc: kg(0.15, 0.5, 8), max: 8, step: 0.5, quick: [2, 4, 8] } }),
  "Tenoxicam": allAuto({ IV: { calc: kg(0.4, 1, 20), max: 20, step: 1, quick: [5, 10, 20] } }),
  "Nefopam": fromTwelve({ IV: { calc: kg(0.2, 1, 20), max: 20, step: 1, quick: [5, 10, 20] } }),

  // Local anaesthetics (mL)
  "Bupivacaine": bySpinalWeight({ INFILTRATION: block, PERINEURAL: block, EPIDURAL: caudal, INTRATHECAL: { defaultConcentration: "0.5%" } }),
  "Levobupivacaine": bySpinalWeight({}),
  "Prilocaine": allAuto({
    // Intravenous regional (Bier) block: 3 mg/kg as 0.5%.
    IV: { calc: kg(0.6, 0.5, 40), max: 40, step: 0.5, quick: [2, 5, 10, 20, 40], defaultConcentration: "0.5%" },
    INFILTRATION: block,
    PERINEURAL: block,
    EPIDURAL: caudal,
    INTRATHECAL: { calc: kg(0.05, 0.05, 3), max: 3, step: 0.05, quick: SPINAL_QUICK },
  }),
  "Chloroprocaine": allAuto({
    INFILTRATION: block,
    PERINEURAL: block,
    EPIDURAL: caudal,
    INTRATHECAL: { calc: kg(0.1, 0.05, 5), max: 5, step: 0.05, quick: SPINAL_QUICK },
  }),
  "Tetracaine / Amethocaine": bandFrom(MONTH, (band, entry) => auto(band, tuned(profileOf(band, entry), {
    INTRATHECAL: { calc: kg(0.1, 0.05, 2), max: 2, step: 0.05, quick: SPINAL_QUICK },
  }))),
  // 5% hyperbaric lidocaine is not used intrathecally in children.
  "Lidocaine": allAuto({
    INTRATHECAL: { calc: kg(0.1, 0.05, 3), max: 3, step: 0.05, quick: SPINAL_QUICK, concentrationOptions: ["1.5%"], defaultConcentration: "1.5%" },
  }),

  // Heart and circulation
  "Norepinephrine / Noradrenaline": allAuto({ IV: { calc: kg(0.1, 0.1, 10), max: 10, step: 0.1, quick: [0.5, 1, 2, 5, 10] } }),
  "Vasopressin": allAuto({ IV: { calc: kg(0.01, 0.01, 1), max: 2, step: 0.01, quick: [0.05, 0.1, 0.2, 0.5, 1] } }),
  "Calcium chloride": allAuto({ IV: { calc: kg(10, 5, 1000), max: 1000, step: 5, quick: [50, 100, 250, 500, 1000] } }),
  "Calcium gluconate": allAuto({ IV: { calc: kg(50, 10, 2000), max: 3000, step: 10, quick: [100, 250, 500, 1000, 2000] } }),
  // One part of the loading dose.
  "Digoxin": allAuto({ IV: { calc: kg(0.01, 0.005, 0.25), max: 0.5, step: 0.005, quick: [0.025, 0.05, 0.1, 0.125, 0.25] } }),
  "Nitroglycerin / Glyceryl trinitrate": allAuto({ IV: { calc: kg(1, 1, 100), max: 100, step: 1, quick: [5, 10, 25, 50, 100] } }),
  "Amiodarone": allAuto({ IV: { calc: kg(5, 1, 300), max: 300, step: 1, quick: [10, 25, 50, 100, 150, 300] } }),
  "Esmolol": allAuto({ IV: { calc: kg(0.5, 0.5, 40), max: 100, step: 0.5, quick: [2.5, 5, 10, 20, 40] } }),
  "Diltiazem": allAuto({ IV: { calc: kg(0.25, 0.25, 20), max: 25, step: 0.25, quick: [1, 2.5, 5, 10, 20] } }),
  "Levosimendan": allAuto({ IV: { calc: kg(6, 5, 500), max: 1000, step: 5, quick: [25, 50, 100, 250, 500] } }),
  "Terlipressin": allAuto({ IV: { calc: kg(0.02, 0.01, 1), max: 2, step: 0.01, quick: [0.1, 0.2, 0.5, 1] } }),

  // Antiemetics. Fosaprepitant (under 6 months) and chlorphenamine (under 1
  // month) are not licensed there.
  "Cyclizine": allAuto({ "*": { calc: kg(1, 0.5, 50), max: 50, step: 0.5, quick: [5, 10, 25, 50] } }),
  "Fosaprepitant": bandFrom(0, hidden),
  "Chlorphenamine / Chlorpheniramine": bandFrom(0, hidden),

  // Bleeding and clotting. Protamine follows the heparin given: range, no suggestion.
  "Protamine": (entry, bands) => bands.map(band => ({ ...band, profile: tuned(profileOf(band, entry), { IV: { max: 50, step: 1, quick: [5, 10, 20, 30, 50] } }) })),
  "Unfractionated heparin": allAuto({ IV: { calc: kg(100, 10, 10_000), max: 30_000, step: 10, quick: [500, 1000, 2500, 5000, 10_000] } }),
  "Desmopressin": allAuto({ IV: { calc: kg(0.3, 0.1, 20), max: 20, step: 0.1, quick: [1, 2, 5, 10, 20] } }),
  "Vitamin K / Phytomenadione": (entry, bands) => {
    const base = bands[0]!
    const vitaminK = (calc: DoseCalc) => tuned(profileOf(base, entry), { IV: { calc, max: 10, step: 0.1, quick: [0.5, 1, 2, 5, 10] } })
    return [
      { ...auto(base, vitaminK(flat(1, 0.1))), maximumAgeDaysExclusive: MONTH },
      { ...auto(base, vitaminK(kg(0.3, 0.1, 10))), minimumAgeDays: MONTH },
    ]
  },
  "Activated factor VII / Eptacog alfa": allAuto({ IV: { calc: kg(90, 10), max: 9000, step: 10, quick: [1000, 2000, 5000] } }),
  "Prothrombin complex concentrate 4-factor": allAuto({ IV: { calc: kg(25, 10, 2500), max: 5000, step: 10, quick: [250, 500, 1000, 2000] } }),
  "Bivalirudin": allAuto({ IV: { calc: kg(0.75, 0.5, 75), max: 100, step: 0.5, quick: [5, 10, 25, 50] } }),
  "Alteplase": allAuto({ IV: { calc: kg(0.1, 0.1, 2), max: 50, step: 0.1, quick: [0.5, 1, 2, 5, 10] } }),
  "Tenecteplase": allAuto({ IV: { calc: kg(0.5, 0.5, 50), max: 50, step: 0.5, quick: [5, 10, 25, 50] } }),

  // Obstetric: adolescents only, adult doses.
  "Oxytocin": fromTwelve({ IV: { calc: flat(3, 0.5), max: 20, step: 0.5, quick: [1, 3, 5, 10] } }),
  "Carbetocin": fromTwelve({ IV: { calc: flat(100, 1), max: 100, step: 1, quick: [50, 100] } }),
  "Methylergometrine": fromTwelve({ "*": { calc: flat(0.2, 0.01), max: 0.5, step: 0.01, quick: [0.1, 0.2] } }),
  "Carboprost": fromTwelve({ IM: { calc: flat(0.25, 0.01), max: 0.25, step: 0.01, quick: [0.25] } }),
  "Misoprostol": fromTwelve({
    PR: { calc: flat(800, 25), max: 1000, step: 25, quick: [200, 400, 600, 800, 1000] },
    SL: { calc: flat(800, 25), max: 1000, step: 25, quick: [200, 400, 600, 800, 1000] },
    PO: { calc: flat(600, 25), max: 1000, step: 25, quick: [200, 400, 600, 800, 1000] },
  }),

  // Other
  "Terbutaline": bandFrom(0, (band, entry) => auto(band, tuned(profileOf(band, entry), {
    IV: { calc: kg(0.002, 0.001), max: 0.5, step: 0.001, quick: [0.01, 0.02, 0.05, 0.1] },
    SC: { calc: kg(0.005, 0.001, 0.25), max: 0.5, step: 0.001, quick: [0.01, 0.02, 0.05, 0.1] },
  }))),
  "Regular insulin / Actrapid": allAuto({ IV: { calc: kg(0.1, 0.1, 10), max: 10, step: 0.1, quick: [0.5, 1, 2, 5, 10] } }),
  // Over an hour, never pushed.
  "Potassium chloride": allAuto({ IV: { calc: kg(0.5, 0.5, 20), max: 20, step: 0.5, quick: [1, 2, 5, 10, 20] } }),
  "Potassium phosphate": allAuto({ IV: { calc: kg(0.2, 0.1, 10), max: 20, step: 0.1, quick: [1, 2, 5, 10] } }),
  "Sodium phosphate": allAuto({ IV: { calc: kg(0.2, 0.1, 10), max: 20, step: 0.1, quick: [1, 2, 5, 10] } }),
  "Aminophylline": allAuto({ IV: { calc: kg(5, 1, 500), max: 500, step: 1, quick: [25, 50, 100, 250, 500] } }),
  "Theophylline": bandFrom(6 * MONTH, (band, entry) => auto(band, tuned(profileOf(band, entry), {
    IV: { calc: kg(4, 1), max: 100, step: 1, quick: [5, 10, 25, 50] },
  }))),
  "Acetylcysteine": allAuto({ IV: { calc: kg(150, 10, 16_500), max: 20_000, step: 10, quick: [1000, 2000, 5000, 10_000] } }),
}

/** The bands for one drug in v3: v2's bands, with the v3 changes above. */
function v3Bands(entry: DrugCatalogEntry): BandSeed[] {
  const bands = specialBands(entry, "v3") ?? [defaultBand(entry, "v3")]
  return V3_OVERRIDES[entry.name]?.(entry, bands) ?? bands
}

/** The paediatric v3 drug profile bands for every catalogue drug. */
export function createPediatricDrugProfileV3Payloads(
  drugs: readonly DrugCatalogEntry[] = DRUG_CATALOG,
): PediatricDrugProfileRulePayload[] {
  return drugs.flatMap(entry => v3Bands(entry).map(band => profilePayload(entry, band)))
}

export const PEDIATRIC_V3_DRUG_OVERRIDES = Object.keys(V3_OVERRIDES)
