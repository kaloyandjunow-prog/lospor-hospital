import {
  INFUSION_CATALOG,
  type DoseProfileInput,
  type RouteModeInput,
  type WeightBasis,
} from "./catalog"
import {
  PEDIATRIC_INFUSION_DISPOSITIONS,
  validateClinicalRulePayload,
  type PediatricInfusionDisposition,
  type PediatricInfusionProfileRulePayload,
} from "./clinical-rules"

const DAY = 1
const WEEK = 7 * DAY
const YEAR = 365.2425 * DAY
const MONTH = YEAR / 12
const PEDIATRIC_END = 18 * YEAR

const age = {
  weeks: (value: number) => value * WEEK,
  months: (value: number) => value * MONTH,
  years: (value: number) => value * YEAR,
}

type ProfileBand = {
  minimumAgeDays: number
  maximumAgeDaysExclusive: number
  disposition: PediatricInfusionDisposition
  profile: DoseProfileInput | null
  routeDispositions?: Record<string, PediatricInfusionDisposition>
  manualEntryOnly?: boolean
  routeManualEntryOnly?: Record<string, boolean>
  manualUnit?: string | null
  minimumWeightKg?: number | null
  minimumWeightInclusive?: boolean
  maximumWeightKg?: number | null
  maximumWeightInclusive?: boolean
  routineSuggestion?: boolean
  advisory?: string | null
}

type Definition = {
  itemKey: string
  sourceRefs: readonly string[]
  bands: readonly ProfileBand[]
}

export type PediatricInfusionProfileSeed = {
  payload: PediatricInfusionProfileRulePayload
  sourceRefs: string[]
}

type SurfaceInput = {
  min: number
  max: number
  step: number
  unit: string
  quickValues?: number[]
  suggestedRate?: number
  routes?: string[]
  defaultRoute?: string
  weightBasis?: WeightBasis
  concentrationOptions?: string[]
  concentrationUnit?: string
  defaultConcentration?: string
  formulationOptions?: Array<"HYPOBARIC" | "ISOBARIC" | "HYPERBARIC">
  defaultFormulation?: "HYPOBARIC" | "ISOBARIC" | "HYPERBARIC"
}

function surface(input: SurfaceInput): DoseProfileInput {
  return {
    mode: input.concentrationUnit ? "concentration-rate" : "rate",
    min: input.min,
    max: input.max,
    step: input.step,
    quickValues: input.quickValues ?? [],
    unit: input.unit,
    routes: input.routes ?? ["IV"],
    defaultRoute: input.defaultRoute ?? input.routes?.[0] ?? "IV",
    weightBasis: input.weightBasis ?? (input.unit.includes("/kg/") ? "TBW" : "none"),
    suggestedRate: input.suggestedRate,
    concentrationOptions: input.concentrationOptions,
    concentrationUnit: input.concentrationUnit,
    defaultConcentration: input.defaultConcentration,
    formulationOptions: input.formulationOptions,
    defaultFormulation: input.defaultFormulation,
  }
}

function routeSurface(input: SurfaceInput): RouteModeInput {
  const profile = surface(input)
  return {
    mode: profile.mode,
    min: input.min,
    max: input.max,
    step: input.step,
    quickValues: input.quickValues ?? [],
    unit: input.unit,
    weightBasis: input.weightBasis ?? (input.unit.includes("/kg/") ? "TBW" : "none"),
    suggestedRate: input.suggestedRate,
    concentrationOptions: input.concentrationOptions,
    concentrationUnit: input.concentrationUnit,
    defaultConcentration: input.defaultConcentration,
    formulationOptions: input.formulationOptions,
    defaultFormulation: input.defaultFormulation,
  }
}

function routed(
  defaultRoute: string,
  routeModes: Record<string, RouteModeInput>,
): DoseProfileInput {
  return {
    mode: "rate",
    rounding: "nearest_step",
    quickValues: [],
    routes: Object.keys(routeModes),
    defaultRoute,
    weightBasis: "none",
    routeModes,
  }
}

function withSuggested(profile: DoseProfileInput, suggestedRate?: number): DoseProfileInput {
  return { ...profile, suggestedRate }
}

function autoAfter(
  threshold: number,
  profile: DoseProfileInput,
  advisory?: string,
): ProfileBand[] {
  return [
    {
      minimumAgeDays: 0,
      maximumAgeDaysExclusive: threshold,
      disposition: "MANUAL",
      profile: withSuggested(profile),
      advisory,
    },
    {
      minimumAgeDays: threshold,
      maximumAgeDaysExclusive: PEDIATRIC_END,
      disposition: "AUTO",
      profile,
      advisory,
    },
  ]
}

function allAges(
  disposition: PediatricInfusionDisposition,
  profile: DoseProfileInput | null,
  options: Omit<ProfileBand, "minimumAgeDays" | "maximumAgeDaysExclusive" | "disposition" | "profile"> = {},
): ProfileBand {
  return {
    minimumAgeDays: 0,
    maximumAgeDaysExclusive: PEDIATRIC_END,
    disposition,
    profile,
    ...options,
  }
}

const pch = (file: string) =>
  `https://www.pch.health.wa.gov.au/~/media/Files/Hospitals/PCH/General-documents/Health-professionals/MedicationMonographs/${file}.pdf`

const commonIbwAdvisory =
  "Use TBW normally. When pediatric obesity has been clinically identified, use McLaren IBW unless this profile states another weight policy."

const laManual = (unit: string, options: Partial<SurfaceInput> = {}): RouteModeInput => routeSurface({
  min: 0,
  max: 1_000,
  step: 0.01,
  unit,
  concentrationUnit: "PERCENT",
  concentrationOptions: [],
  formulationOptions: ["HYPOBARIC", "ISOBARIC", "HYPERBARIC"],
  ...options,
})

const definitions: readonly Definition[] = [
  {
    itemKey: "Propofol",
    sourceRefs: [pch("propOFol")],
    bands: autoAfter(age.weeks(4), surface({ min: 0, max: 15, step: 0.5, unit: "mg/kg/hr", quickValues: [6, 8, 10, 12, 15], suggestedRate: 10 }), "Anaesthesia maintenance profile; not an ICU sedation default."),
  },
  {
    itemKey: "Ketamine",
    sourceRefs: [pch("Ketamine")],
    bands: autoAfter(age.months(3), surface({ min: 0, max: 3, step: 0.05, unit: "mg/kg/hr", quickValues: [0.05, 0.1, 0.2, 0.4, 0.6, 1, 2, 3], suggestedRate: 0.1 }), "Rates above 0.4 mg/kg/hr require a high-dose or anaesthetic-setting check."),
  },
  {
    itemKey: "Esketamine",
    sourceRefs: ["https://www.medicines.org.uk/emc/product/13195/smpc"],
    bands: [allAges("MANUAL", surface({ min: 0, max: 3, step: 0.05, unit: "mg/kg/hr" }))],
  },
  {
    itemKey: "Dexmedetomidine",
    sourceRefs: [pch("Dexmedetomidine")],
    bands: [
      { minimumAgeDays: 0, maximumAgeDaysExclusive: age.weeks(4), disposition: "MANUAL", profile: surface({ min: 0, max: 1, step: 0.1, unit: "mcg/kg/hr", quickValues: [0.2, 0.4, 0.6, 0.8, 1] }), advisory: commonIbwAdvisory },
      { minimumAgeDays: age.weeks(4), maximumAgeDaysExclusive: age.years(1), disposition: "AUTO", profile: surface({ min: 0, max: 1, step: 0.1, unit: "mcg/kg/hr", quickValues: [0.2, 0.4, 0.6, 0.8, 1], suggestedRate: 0.2 }), advisory: commonIbwAdvisory },
      { minimumAgeDays: age.years(1), maximumAgeDaysExclusive: age.years(6), disposition: "AUTO", profile: surface({ min: 0, max: 1.4, step: 0.1, unit: "mcg/kg/hr", quickValues: [0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4], suggestedRate: 0.2 }), advisory: commonIbwAdvisory },
      { minimumAgeDays: age.years(6), maximumAgeDaysExclusive: age.years(11), disposition: "AUTO", profile: surface({ min: 0, max: 1.3, step: 0.1, unit: "mcg/kg/hr", quickValues: [0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.3], suggestedRate: 0.2 }), advisory: commonIbwAdvisory },
      { minimumAgeDays: age.years(11), maximumAgeDaysExclusive: PEDIATRIC_END, disposition: "AUTO", profile: surface({ min: 0, max: 1, step: 0.1, unit: "mcg/kg/hr", quickValues: [0.2, 0.4, 0.6, 0.8, 1], suggestedRate: 0.2 }), advisory: commonIbwAdvisory },
    ],
  },
  {
    itemKey: "Fentanyl",
    sourceRefs: [pch("Fentanyl")],
    bands: autoAfter(age.weeks(4), surface({ min: 0, max: 10, step: 0.1, unit: "mcg/kg/hr", quickValues: [0.5, 1, 2, 3, 5, 7.5, 10], suggestedRate: 1 }), "At 50 kg or more, warn when the calculated total exceeds 200 mcg/hr."),
  },
  { itemKey: "Sufentanil", sourceRefs: ["https://www.accessdata.fda.gov/drugsatfda_docs/label/2016/019050s034lbl.pdf"], bands: [allAges("MANUAL", surface({ min: 0, max: 1, step: 0.05, unit: "mcg/kg/hr" }))] },
  { itemKey: "Remifentanil", sourceRefs: ["https://www.medicines.org.uk/emc/product/15232/smpc"], bands: autoAfter(age.years(1), surface({ min: 0, max: 1.3, step: 0.025, unit: "mcg/kg/min", quickValues: [0.05, 0.1, 0.15, 0.25, 0.5, 0.75, 1, 1.3], suggestedRate: 0.25 })) },
  { itemKey: "Alfentanil", sourceRefs: ["https://www.medicines.org.uk/emc/product/6427/smpc"], bands: autoAfter(age.years(2), surface({ min: 0, max: 2, step: 0.1, unit: "mcg/kg/min", quickValues: [0.5, 0.75, 1, 1.5, 2], suggestedRate: 1 })) },
  { itemKey: "Magnesium sulfate", sourceRefs: [pch("Magnesium")], bands: [allAges("MANUAL", surface({ min: 0, max: 1.2, step: 0.05, unit: "mmol/kg/hr", routes: ["IV", "INTRAOSSEOUS"] }), { advisory: "Neonates require the neonatal protocol; legitimate regimens differ materially." })] },
  {
    itemKey: "Lidocaine",
    sourceRefs: [pch("Lidocaine")],
    bands: [
      {
        minimumAgeDays: 0,
        maximumAgeDaysExclusive: age.years(2),
        disposition: "MANUAL",
        profile: routed("IV", {
          IV: routeSurface({ min: 0, max: 6, step: 0.1, unit: "mg/kg/hr", quickValues: [0.6, 1, 1.5, 2, 3, 4, 6] }),
          EPIDURAL: laManual("mL/kg/hr", { concentrationOptions: ["0.5%", "1%"] }),
          PERINEURAL: laManual("mL/kg/hr", { concentrationOptions: ["0.5%", "1%"] }),
          INTRATHECAL: laManual("mL/hr"),
        }),
        routeDispositions: { IV: "MANUAL", EPIDURAL: "LOCAL", PERINEURAL: "LOCAL", INTRATHECAL: "LOCAL" },
        routeManualEntryOnly: { EPIDURAL: true, PERINEURAL: true, INTRATHECAL: true },
      },
      {
        minimumAgeDays: age.years(2),
        maximumAgeDaysExclusive: PEDIATRIC_END,
        disposition: "AUTO",
        profile: routed("IV", {
          IV: routeSurface({ min: 0, max: 6, step: 0.1, unit: "mg/kg/hr", quickValues: [0.6, 1, 1.5, 2, 3, 4, 6], suggestedRate: 1 }),
          EPIDURAL: laManual("mL/kg/hr", { concentrationOptions: ["0.5%", "1%"] }),
          PERINEURAL: laManual("mL/kg/hr", { concentrationOptions: ["0.5%", "1%"] }),
          INTRATHECAL: laManual("mL/hr"),
        }),
        routeDispositions: { IV: "AUTO", EPIDURAL: "LOCAL", PERINEURAL: "LOCAL", INTRATHECAL: "LOCAL" },
        routeManualEntryOnly: { EPIDURAL: true, PERINEURAL: true, INTRATHECAL: true },
      },
    ],
  },
  {
    itemKey: "Bupivacaine",
    sourceRefs: ["https://esraeurope.org/wp-content/uploads/2021/01/LA-dose-and-adjuvants-for-kids.pdf"],
    bands: [
      {
        minimumAgeDays: 0,
        maximumAgeDaysExclusive: age.weeks(4),
        disposition: "LOCAL",
        profile: routed("EPIDURAL", {
          EPIDURAL: routeSurface({ min: 0, max: 0.2, step: 0.01, unit: "mg/kg/hr", quickValues: [0.1, 0.2], concentrationOptions: ["0.1%", "0.125%", "0.2%", "0.25%"], concentrationUnit: "PERCENT", defaultConcentration: "0.1%" }),
          PERINEURAL: routeSurface({ min: 0, max: 0.3, step: 0.01, unit: "mg/kg/hr", quickValues: [0.1, 0.2, 0.3], concentrationOptions: ["0.1%", "0.125%", "0.2%", "0.25%"], concentrationUnit: "PERCENT", defaultConcentration: "0.1%" }),
          INTRATHECAL: laManual("mL/hr"),
        }),
        routeDispositions: { EPIDURAL: "LOCAL", PERINEURAL: "MANUAL", INTRATHECAL: "LOCAL" },
        routeManualEntryOnly: { EPIDURAL: true, INTRATHECAL: true },
      },
      {
        minimumAgeDays: age.weeks(4), maximumAgeDaysExclusive: age.months(3), disposition: "AUTO",
        profile: routed("EPIDURAL", {
          EPIDURAL: routeSurface({ min: 0, max: 0.2, step: 0.01, unit: "mg/kg/hr", quickValues: [0.1, 0.2], suggestedRate: 0.2, concentrationOptions: ["0.1%", "0.125%", "0.2%", "0.25%"], concentrationUnit: "PERCENT", defaultConcentration: "0.1%" }),
          PERINEURAL: routeSurface({ min: 0, max: 0.3, step: 0.01, unit: "mg/kg/hr", quickValues: [0.1, 0.2, 0.3], concentrationOptions: ["0.1%", "0.125%", "0.2%", "0.25%"], concentrationUnit: "PERCENT", defaultConcentration: "0.1%" }),
          INTRATHECAL: laManual("mL/hr"),
        }),
        routeDispositions: { EPIDURAL: "AUTO", PERINEURAL: "MANUAL", INTRATHECAL: "LOCAL" }, routeManualEntryOnly: { INTRATHECAL: true },
      },
      {
        minimumAgeDays: age.months(3), maximumAgeDaysExclusive: age.years(1), disposition: "AUTO",
        profile: routed("EPIDURAL", {
          EPIDURAL: routeSurface({ min: 0, max: 0.3, step: 0.01, unit: "mg/kg/hr", quickValues: [0.1, 0.2, 0.3], suggestedRate: 0.2, concentrationOptions: ["0.1%", "0.125%", "0.2%", "0.25%"], concentrationUnit: "PERCENT", defaultConcentration: "0.1%" }),
          PERINEURAL: routeSurface({ min: 0, max: 0.3, step: 0.01, unit: "mg/kg/hr", quickValues: [0.1, 0.2, 0.3], concentrationOptions: ["0.1%", "0.125%", "0.2%", "0.25%"], concentrationUnit: "PERCENT", defaultConcentration: "0.1%" }),
          INTRATHECAL: laManual("mL/hr"),
        }), routeDispositions: { EPIDURAL: "AUTO", PERINEURAL: "MANUAL", INTRATHECAL: "LOCAL" }, routeManualEntryOnly: { INTRATHECAL: true },
      },
      {
        minimumAgeDays: age.years(1), maximumAgeDaysExclusive: PEDIATRIC_END, disposition: "AUTO",
        profile: routed("EPIDURAL", {
          EPIDURAL: routeSurface({ min: 0, max: 0.4, step: 0.01, unit: "mg/kg/hr", quickValues: [0.1, 0.2, 0.3, 0.4], suggestedRate: 0.2, concentrationOptions: ["0.1%", "0.125%", "0.2%", "0.25%"], concentrationUnit: "PERCENT", defaultConcentration: "0.1%" }),
          PERINEURAL: routeSurface({ min: 0, max: 0.3, step: 0.01, unit: "mg/kg/hr", quickValues: [0.1, 0.2, 0.3], suggestedRate: 0.2, concentrationOptions: ["0.1%", "0.125%", "0.2%", "0.25%"], concentrationUnit: "PERCENT", defaultConcentration: "0.1%" }),
          INTRATHECAL: laManual("mL/hr"),
        }), routeDispositions: { EPIDURAL: "AUTO", PERINEURAL: "AUTO", INTRATHECAL: "LOCAL" }, routeManualEntryOnly: { INTRATHECAL: true },
      },
    ],
  },
  {
    itemKey: "Levobupivacaine",
    sourceRefs: ["https://www.medicines.org.uk/emc/product/13643/smpc"],
    bands: [
      {
        minimumAgeDays: 0, maximumAgeDaysExclusive: age.weeks(4), disposition: "LOCAL",
        profile: routed("EPIDURAL", {
          EPIDURAL: routeSurface({ min: 0, max: 0.2, step: 0.01, unit: "mg/kg/hr", quickValues: [0.1, 0.2], concentrationOptions: ["0.1%", "0.125%", "0.2%", "0.25%"], concentrationUnit: "PERCENT", defaultConcentration: "0.1%" }),
          PERINEURAL: laManual("mL/kg/hr", { concentrationOptions: ["0.1%", "0.125%", "0.2%", "0.25%"] }),
          INTRATHECAL: laManual("mL/hr"),
        }), routeDispositions: { EPIDURAL: "LOCAL", PERINEURAL: "LOCAL", INTRATHECAL: "LOCAL" }, routeManualEntryOnly: { EPIDURAL: true, PERINEURAL: true, INTRATHECAL: true },
      },
      ...[0.2, 0.3, 0.4].map((maximum, index): ProfileBand => {
        const starts = [age.weeks(4), age.months(3), age.years(1)]
        const ends = [age.months(3), age.years(1), PEDIATRIC_END]
        return {
          minimumAgeDays: starts[index]!, maximumAgeDaysExclusive: ends[index]!, disposition: "AUTO",
          profile: routed("EPIDURAL", {
            EPIDURAL: routeSurface({ min: 0, max: maximum, step: 0.01, unit: "mg/kg/hr", quickValues: [0.1, 0.2, ...maximum > 0.2 ? [maximum] : []], suggestedRate: 0.2, concentrationOptions: ["0.1%", "0.125%", "0.2%", "0.25%"], concentrationUnit: "PERCENT", defaultConcentration: "0.1%" }),
            PERINEURAL: laManual("mL/kg/hr", { concentrationOptions: ["0.1%", "0.125%", "0.2%", "0.25%"] }),
            INTRATHECAL: laManual("mL/hr"),
          }), routeDispositions: { EPIDURAL: "AUTO", PERINEURAL: "LOCAL", INTRATHECAL: "LOCAL" }, routeManualEntryOnly: { PERINEURAL: true, INTRATHECAL: true },
        }
      }),
    ],
  },
  {
    itemKey: "Ropivacaine",
    sourceRefs: ["https://www.medicines.org.uk/emc/product/15803/smpc"],
    bands: [
      {
        minimumAgeDays: 0, maximumAgeDaysExclusive: age.weeks(4), disposition: "LOCAL",
        profile: routed("EPIDURAL", {
          EPIDURAL: routeSurface({ min: 0, max: 0.1, step: 0.01, unit: "mL/kg/hr", quickValues: [0.05, 0.1], concentrationOptions: ["0.1%", "0.2%"], concentrationUnit: "PERCENT", defaultConcentration: "0.2%" }),
          PERINEURAL: routeSurface({ min: 0, max: 0.15, step: 0.01, unit: "mL/kg/hr", quickValues: [0.05, 0.1, 0.15], concentrationOptions: ["0.2%"], concentrationUnit: "PERCENT", defaultConcentration: "0.2%" }),
          INTRATHECAL: laManual("mL/hr"),
        }), routeDispositions: { EPIDURAL: "LOCAL", PERINEURAL: "LOCAL", INTRATHECAL: "LOCAL" }, routeManualEntryOnly: { EPIDURAL: true, PERINEURAL: true, INTRATHECAL: true },
      },
      {
        minimumAgeDays: age.weeks(4), maximumAgeDaysExclusive: age.months(6), disposition: "AUTO",
        profile: routed("EPIDURAL", {
          EPIDURAL: routeSurface({ min: 0, max: 0.1, step: 0.01, unit: "mL/kg/hr", quickValues: [0.05, 0.1], suggestedRate: 0.1, concentrationOptions: ["0.1%", "0.2%"], concentrationUnit: "PERCENT", defaultConcentration: "0.2%" }),
          PERINEURAL: routeSurface({ min: 0, max: 0.15, step: 0.01, unit: "mL/kg/hr", quickValues: [0.05, 0.1, 0.15], concentrationOptions: ["0.2%"], concentrationUnit: "PERCENT", defaultConcentration: "0.2%" }),
          INTRATHECAL: laManual("mL/hr"),
        }), routeDispositions: { EPIDURAL: "AUTO", PERINEURAL: "LOCAL", INTRATHECAL: "LOCAL" }, routeManualEntryOnly: { PERINEURAL: true, INTRATHECAL: true },
      },
      {
        minimumAgeDays: age.months(6), maximumAgeDaysExclusive: age.years(1), disposition: "AUTO",
        profile: routed("EPIDURAL", {
          EPIDURAL: routeSurface({ min: 0, max: 0.2, step: 0.01, unit: "mL/kg/hr", quickValues: [0.1, 0.2], suggestedRate: 0.2, concentrationOptions: ["0.1%", "0.2%"], concentrationUnit: "PERCENT", defaultConcentration: "0.2%" }),
          PERINEURAL: routeSurface({ min: 0, max: 0.15, step: 0.01, unit: "mL/kg/hr", quickValues: [0.05, 0.1, 0.15], concentrationOptions: ["0.2%"], concentrationUnit: "PERCENT", defaultConcentration: "0.2%" }),
          INTRATHECAL: laManual("mL/hr"),
        }), routeDispositions: { EPIDURAL: "AUTO", PERINEURAL: "LOCAL", INTRATHECAL: "LOCAL" }, routeManualEntryOnly: { PERINEURAL: true, INTRATHECAL: true },
      },
      {
        minimumAgeDays: age.years(1), maximumAgeDaysExclusive: PEDIATRIC_END, disposition: "AUTO",
        profile: routed("EPIDURAL", {
          EPIDURAL: routeSurface({ min: 0, max: 0.2, step: 0.01, unit: "mL/kg/hr", quickValues: [0.1, 0.2], suggestedRate: 0.2, concentrationOptions: ["0.1%", "0.2%"], concentrationUnit: "PERCENT", defaultConcentration: "0.2%" }),
          PERINEURAL: routeSurface({ min: 0, max: 0.15, step: 0.01, unit: "mL/kg/hr", quickValues: [0.05, 0.1, 0.15], suggestedRate: 0.1, concentrationOptions: ["0.2%"], concentrationUnit: "PERCENT", defaultConcentration: "0.2%" }),
          INTRATHECAL: laManual("mL/hr"),
        }), routeDispositions: { EPIDURAL: "AUTO", PERINEURAL: "AUTO", INTRATHECAL: "LOCAL" }, routeManualEntryOnly: { INTRATHECAL: true },
      },
    ],
  },
  { itemKey: "Rocuronium", sourceRefs: ["https://www.medicines.org.uk/emc/product/553/smpc"], bands: autoAfter(age.weeks(4), surface({ min: 0, max: 1, step: 0.05, unit: "mg/kg/hr", quickValues: [0.3, 0.4, 0.5, 0.6], suggestedRate: 0.4 }), "In obesity use adjusted body weight calculated from McLaren IBW; continuous neuromuscular monitoring is required.") },
  { itemKey: "Vecuronium", sourceRefs: [pch("Vecuronium")], bands: autoAfter(age.weeks(4), surface({ min: 0, max: 0.15, step: 0.01, unit: "mg/kg/hr", quickValues: [0.05, 0.08, 0.1, 0.12, 0.15], suggestedRate: 0.05 })) },
  { itemKey: "Cisatracurium", sourceRefs: ["https://www.medicines.org.uk/emc/product/1381/smpc"], bands: autoAfter(age.years(2), surface({ min: 0, max: 0.18, step: 0.01, unit: "mg/kg/hr", quickValues: [0.06, 0.08, 0.1, 0.12, 0.18], suggestedRate: 0.1 })) },
  { itemKey: "Atracurium", sourceRefs: ["https://www.medicines.org.uk/emc/product/3785/smpc"], bands: autoAfter(age.weeks(4), surface({ min: 0, max: 0.8, step: 0.05, unit: "mg/kg/hr", quickValues: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8], suggestedRate: 0.3 })) },
  {
    itemKey: "Mivacurium", sourceRefs: ["https://www.medicines.org.uk/emc/product/948/smpc"], bands: [
      { minimumAgeDays: 0, maximumAgeDaysExclusive: age.months(2), disposition: "MANUAL", profile: surface({ min: 0, max: 15, step: 1, unit: "mcg/kg/min", quickValues: [4, 6, 8, 10, 12, 14] }) },
      { minimumAgeDays: age.months(2), maximumAgeDaysExclusive: age.years(13), disposition: "AUTO", profile: surface({ min: 0, max: 15, step: 1, unit: "mcg/kg/min", quickValues: [4, 6, 8, 10, 12, 14], suggestedRate: 12 }) },
      { minimumAgeDays: age.years(13), maximumAgeDaysExclusive: PEDIATRIC_END, disposition: "AUTO", profile: surface({ min: 0, max: 15, step: 1, unit: "mcg/kg/min", quickValues: [4, 6, 8, 10, 12, 14], suggestedRate: 8 }) },
    ],
  },
  { itemKey: "Phenylephrine", sourceRefs: [pch("Phenyleprine")], bands: autoAfter(age.weeks(4), surface({ min: 0, max: 5, step: 0.1, unit: "mcg/kg/min", quickValues: [0.1, 0.25, 0.5, 1, 2, 3, 5], suggestedRate: 0.5 })) },
  { itemKey: "Norepinephrine / Noradrenaline", sourceRefs: [pch("Noradrenaline")], bands: [allAges("AUTO", surface({ min: 0, max: 3, step: 0.01, unit: "mcg/kg/min", quickValues: [0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 3], suggestedRate: 0.05, routes: ["IV", "INTRAOSSEOUS"] }))] },
  {
    itemKey: "Epinephrine / Adrenaline", sourceRefs: [pch("Adrenaline")], bands: [
      { minimumAgeDays: 0, maximumAgeDaysExclusive: age.weeks(4), disposition: "AUTO", profile: surface({ min: 0, max: 1, step: 0.01, unit: "mcg/kg/min", quickValues: [0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 1], suggestedRate: 0.1, routes: ["IV"] }), advisory: "High-dose alert above 0.3 mcg/kg/min." },
      { minimumAgeDays: age.weeks(4), maximumAgeDaysExclusive: PEDIATRIC_END, disposition: "AUTO", profile: surface({ min: 0, max: 1, step: 0.01, unit: "mcg/kg/min", quickValues: [0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 1], suggestedRate: 0.05, routes: ["IV", "INTRAOSSEOUS"] }), advisory: "High-dose alert above 0.3 mcg/kg/min." },
    ],
  },
  { itemKey: "Metaraminol", sourceRefs: [pch("Metaraminol")], bands: autoAfter(age.weeks(4), surface({ min: 0, max: 5, step: 0.05, unit: "mcg/kg/min", quickValues: [0.05, 0.1, 0.2, 0.3, 0.5], suggestedRate: 0.05 }), "Alert above the usual maximum of 0.5 mcg/kg/min; 5 is an exceptional ceiling.") },
  {
    itemKey: "Dopamine", sourceRefs: [pch("Dopamine")], bands: [
      { minimumAgeDays: 0, maximumAgeDaysExclusive: age.weeks(4), disposition: "AUTO", profile: surface({ min: 0, max: 20, step: 1, unit: "mcg/kg/min", quickValues: [2, 5, 10, 15, 20], suggestedRate: 5, routes: ["IV"] }) },
      { minimumAgeDays: age.weeks(4), maximumAgeDaysExclusive: PEDIATRIC_END, disposition: "AUTO", profile: surface({ min: 0, max: 20, step: 1, unit: "mcg/kg/min", quickValues: [2, 5, 10, 15, 20], suggestedRate: 5, routes: ["IV", "INTRAOSSEOUS"] }) },
    ],
  },
  { itemKey: "Vasopressin", sourceRefs: [pch("Argipressin")], bands: autoAfter(age.weeks(4), surface({ min: 0, max: 0.1, step: 0.005, unit: "IU/kg/hr", quickValues: [0.01, 0.02, 0.03, 0.04, 0.05, 0.06], suggestedRate: 0.01 }), "Vasopressor profile only; alert above 0.06 IU/kg/hr. Diabetes-insipidus dosing remains manual.") },
  { itemKey: "Angiotensin II", sourceRefs: ["https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=c265d69a-3efe-4107-9a9e-e6fd3d531c48"], bands: [allAges("LOCAL", null, { manualUnit: "ng/kg/min", manualEntryOnly: true, advisory: "Pediatric safety and efficacy are unestablished; institution or personal protocol required." })] },
  {
    itemKey: "Dobutamine", sourceRefs: [pch("Dobutamine")], bands: [
      { minimumAgeDays: 0, maximumAgeDaysExclusive: age.weeks(4), disposition: "AUTO", profile: surface({ min: 0, max: 20, step: 0.5, unit: "mcg/kg/min", quickValues: [5, 7.5, 10, 15, 20], suggestedRate: 5, routes: ["IV"] }), advisory: commonIbwAdvisory },
      { minimumAgeDays: age.weeks(4), maximumAgeDaysExclusive: PEDIATRIC_END, disposition: "AUTO", profile: surface({ min: 0, max: 20, step: 0.5, unit: "mcg/kg/min", quickValues: [5, 7.5, 10, 15, 20], suggestedRate: 5, routes: ["IV", "INTRAOSSEOUS"] }), advisory: commonIbwAdvisory },
    ],
  },
  {
    itemKey: "Milrinone", sourceRefs: [pch("Milrinone")], bands: [
      { minimumAgeDays: 0, maximumAgeDaysExclusive: age.weeks(4), disposition: "MANUAL", profile: surface({ min: 0, max: 0.75, step: 0.025, unit: "mcg/kg/min", quickValues: [0.25, 0.375, 0.5, 0.75], routes: ["IV"] }), advisory: "Use actual/TBW, including obesity, capped at 120 kg." },
      { minimumAgeDays: age.weeks(4), maximumAgeDaysExclusive: PEDIATRIC_END, disposition: "AUTO", profile: surface({ min: 0, max: 0.75, step: 0.025, unit: "mcg/kg/min", quickValues: [0.25, 0.375, 0.5, 0.75], suggestedRate: 0.25, routes: ["IV", "INTRAOSSEOUS"] }), advisory: "Use actual/TBW, including obesity, capped at 120 kg." },
    ],
  },
  { itemKey: "Levosimendan", sourceRefs: [pch("Levosimendan")], bands: [allAges("AUTO", surface({ min: 0, max: 0.2, step: 0.01, unit: "mcg/kg/min", quickValues: [0.05, 0.1, 0.15, 0.2], suggestedRate: 0.1 }), { advisory: "Use actual/TBW up to 120 kg; no automatic loading dose." })] },
  { itemKey: "Isoproterenol / Isoprenaline", sourceRefs: [pch("Isoprenaline")], bands: [allAges("AUTO", surface({ min: 0, max: 2, step: 0.05, unit: "mcg/kg/min", quickValues: [0.05, 0.1, 0.2, 0.5, 1, 2], suggestedRate: 0.1, routes: ["IV", "INTRAOSSEOUS"] }))] },
  { itemKey: "Nitroglycerin / Glyceryl trinitrate", sourceRefs: [pch("GlycerylTrinitrate")], bands: autoAfter(age.weeks(4), surface({ min: 0, max: 10, step: 0.1, unit: "mcg/kg/min", quickValues: [0.2, 0.5, 1, 2, 5, 10], suggestedRate: 0.5 })) },
  {
    itemKey: "Sodium nitroprusside", sourceRefs: [pch("SodiumNitroprusside")], bands: [
      { minimumAgeDays: 0, maximumAgeDaysExclusive: age.weeks(4), disposition: "AUTO", profile: surface({ min: 0, max: 6, step: 0.1, unit: "mcg/kg/min", quickValues: [0.2, 0.5, 1, 2, 4, 6], suggestedRate: 0.5, routes: ["IV"] }), advisory: "Alert above 2 mcg/kg/min; the upper bound is a brief-use ceiling." },
      { minimumAgeDays: age.weeks(4), maximumAgeDaysExclusive: PEDIATRIC_END, disposition: "AUTO", profile: surface({ min: 0, max: 10, step: 0.1, unit: "mcg/kg/min", quickValues: [0.3, 0.5, 1, 2, 4, 8, 10], suggestedRate: 0.5, routes: ["IV", "INTRAOSSEOUS"] }), advisory: "Alert above 2 mcg/kg/min; 10 is a brief-use ceiling." },
    ],
  },
  { itemKey: "Nicardipine", sourceRefs: ["https://www.childrens.health.qld.gov.au/__data/assets/pdf_file/0020/218513/230602_CIDD-Guidelines.pdf"], bands: autoAfter(age.weeks(4), surface({ min: 0, max: 4, step: 0.1, unit: "mcg/kg/min", quickValues: [0.5, 1, 2, 3, 4], suggestedRate: 0.5 }), "Cap at the lower of 4 mcg/kg/min or 5 mg/hr.") },
  { itemKey: "Clevidipine", sourceRefs: ["https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=a6826aa3-fabb-4ff1-a7a3-cd4c34e3a330"], bands: [allAges("LOCAL", null, { manualUnit: "mcg/kg/min", manualEntryOnly: true, advisory: "Pediatric safety and efficacy are unestablished; local protocol required." })] },
  { itemKey: "Esmolol", sourceRefs: [pch("Esmolol")], bands: autoAfter(age.weeks(4), surface({ min: 0, max: 1_000, step: 25, unit: "mcg/kg/min", quickValues: [25, 50, 100, 250, 500, 1_000], suggestedRate: 50 }), "Duration alert after 48 hours; no automatic loading dose.") },
  { itemKey: "Labetalol", sourceRefs: [pch("Labetalol")], bands: autoAfter(age.weeks(4), surface({ min: 0, max: 3, step: 0.05, unit: "mg/kg/hr", quickValues: [0.25, 0.5, 1, 2, 3], suggestedRate: 0.25 }), "Warn when the calculated initial rate exceeds 120 mg/hr.") },
  {
    itemKey: "Epoprostenol", sourceRefs: [pch("Epoprostenol")], bands: [
      { minimumAgeDays: 0, maximumAgeDaysExclusive: age.weeks(4), disposition: "AUTO", profile: surface({ min: 0, max: 40, step: 1, unit: "ng/kg/min", quickValues: [2, 5, 10, 20, 40], suggestedRate: 2 }), advisory: "Never flush or interrupt abruptly; the maximum is a soft specialist limit." },
      { minimumAgeDays: age.weeks(4), maximumAgeDaysExclusive: PEDIATRIC_END, disposition: "AUTO", profile: surface({ min: 0, max: 80, step: 1, unit: "ng/kg/min", quickValues: [2, 5, 10, 20, 40, 60, 80], suggestedRate: 2 }), advisory: "Never flush or interrupt abruptly; the maximum is a soft specialist limit." },
    ],
  },
  { itemKey: "Iloprost", sourceRefs: ["https://www.medicines.org.uk/emc/product/10034/smpc"], bands: [allAges("LOCAL", null, { manualUnit: "ng/kg/min", manualEntryOnly: true, advisory: "IV iloprost is a separate profile from inhaled iloprost; local protocol required." })] },
  { itemKey: "Amiodarone", sourceRefs: [pch("Amiodarone")], bands: autoAfter(age.weeks(4), surface({ min: 0, max: 15, step: 1, unit: "mcg/kg/min", quickValues: [5, 10, 15], suggestedRate: 5 }), "Use actual weight even in obesity. Hard cap is the lower of 15 mcg/kg/min or 1200 mg/day.") },
  {
    itemKey: "Diltiazem", sourceRefs: ["https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=5e36488b-8f2d-4dc9-b803-af1829e6fdd0"], bands: [
      { minimumAgeDays: 0, maximumAgeDaysExclusive: age.years(1), disposition: "HIDDEN", profile: null, manualEntryOnly: true, routineSuggestion: false, advisory: "Unavailable for new pediatric entries below 1 year." },
      { minimumAgeDays: age.years(1), maximumAgeDaysExclusive: PEDIATRIC_END, disposition: "MANUAL", profile: surface({ min: 0, max: 0.25, step: 0.01, unit: "mg/kg/hr" }), advisory: "Off-label and sparsely evidenced; 15 mg/hr is a soft absolute warning." },
    ],
  },
  { itemKey: "Octreotide", sourceRefs: [pch("Octreotide")], bands: autoAfter(age.weeks(4), surface({ min: 0, max: 10, step: 0.1, unit: "mcg/kg/hr", quickValues: [0.3, 0.5, 1, 2, 5, 10], suggestedRate: 1 }), "Short-acting formulation. 50 mcg/hr is a contextual GI-bleeding warning, not a universal cap.") },
  { itemKey: "Unfractionated heparin", sourceRefs: [pch("Heparin")], bands: [allAges("MANUAL", surface({ min: 0, max: 40, step: 1, unit: "IU/kg/hr", quickValues: [10, 20, 28] }), { advisory: "Direct entry above 40 remains possible. Titrate to aPTT or anti-Xa; no universal cap. " + commonIbwAdvisory })] },
  { itemKey: "Bivalirudin", sourceRefs: ["https://pig.rch.org.au/pages/bivalirudin"], bands: [allAges("LOCAL", surface({ min: 0, max: 3, step: 0.025, unit: "mg/kg/hr" }), { advisory: "ECMO/VAD, VTE/HIT, catheterisation and bypass rates are not interchangeable. Use actual/TBW and reduce for renal impairment." })] },
  { itemKey: "Argatroban", sourceRefs: ["https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=46cdf9e6-839c-49c8-9ee1-c30cfdd9368d"], bands: [allAges("LOCAL", surface({ min: 0, max: 10, step: 0.05, unit: "mcg/kg/min", quickValues: [0.2, 0.5, 0.75, 1, 2] }), { advisory: "Alert above 2 mcg/kg/min. Dose must follow aPTT and hepatic function; no validated pediatric hard maximum." })] },
  { itemKey: "Oxytocin", sourceRefs: ["https://www.who.int/publications/i/item/9789240115637"], bands: [allAges("LOCAL", null, { manualEntryOnly: true, routineSuggestion: false, advisory: "Use only in a clinically applicable obstetric context. Unit and rate depend on the institution's obstetric regimen." })] },
  {
    itemKey: "Regular insulin / Actrapid", sourceRefs: [pch("Insulin")], bands: [
      { minimumAgeDays: 0, maximumAgeDaysExclusive: age.weeks(4), disposition: "AUTO", profile: surface({ min: 0, max: 0.1, step: 0.01, unit: "IU/kg/hr", quickValues: [0.01, 0.05, 0.1], suggestedRate: 0.05 }), advisory: "Never automatically add a bolus. Soft absolute warning above 5 IU/hr. " + commonIbwAdvisory },
      { minimumAgeDays: age.weeks(4), maximumAgeDaysExclusive: PEDIATRIC_END, disposition: "AUTO", profile: surface({ min: 0, max: 0.15, step: 0.01, unit: "IU/kg/hr", quickValues: [0.05, 0.1, 0.15], suggestedRate: 0.05 }), advisory: "Never automatically add a bolus. Soft absolute warning above 5 IU/hr. " + commonIbwAdvisory },
    ],
  },
  {
    itemKey: "Furosemide", sourceRefs: [pch("Furosemide")], bands: [
      { minimumAgeDays: 0, maximumAgeDaysExclusive: age.weeks(4), disposition: "AUTO", profile: surface({ min: 0, max: 0.4, step: 0.01, unit: "mg/kg/hr", quickValues: [0.05, 0.1, 0.2, 0.3, 0.4], suggestedRate: 0.05 }), advisory: "Neonatal hard maximum 0.4 mg/kg/hr. " + commonIbwAdvisory },
      { minimumAgeDays: age.weeks(4), maximumAgeDaysExclusive: PEDIATRIC_END, disposition: "AUTO", profile: surface({ min: 0, max: 1, step: 0.01, unit: "mg/kg/hr", quickValues: [0.05, 0.1, 0.2, 0.4, 0.5], suggestedRate: 0.05 }), advisory: "Soft alert above 0.5 mg/kg/hr; hard maximum 1 mg/kg/hr. " + commonIbwAdvisory },
    ],
  },
  {
    itemKey: "Aminophylline", sourceRefs: [pch("Aminophylline")], bands: [
      { minimumAgeDays: 0, maximumAgeDaysExclusive: age.weeks(6), disposition: "MANUAL", profile: surface({ min: 0, max: 1.5, step: 0.05, unit: "mg/kg/hr" }), advisory: commonIbwAdvisory },
      { minimumAgeDays: age.weeks(6), maximumAgeDaysExclusive: age.months(6), disposition: "AUTO", profile: surface({ min: 0, max: 1.5, step: 0.05, unit: "mg/kg/hr", quickValues: [0.5], suggestedRate: 0.5 }), advisory: commonIbwAdvisory },
      { minimumAgeDays: age.months(6), maximumAgeDaysExclusive: age.years(1), disposition: "AUTO", profile: surface({ min: 0, max: 1.5, step: 0.05, unit: "mg/kg/hr", quickValues: [0.7], suggestedRate: 0.7 }), advisory: commonIbwAdvisory },
      { minimumAgeDays: age.years(1), maximumAgeDaysExclusive: age.years(9), disposition: "AUTO", profile: surface({ min: 0, max: 1.5, step: 0.05, unit: "mg/kg/hr", quickValues: [0.9, 1, 1.1], suggestedRate: 1 }), advisory: commonIbwAdvisory },
      { minimumAgeDays: age.years(9), maximumAgeDaysExclusive: age.years(12), disposition: "AUTO", profile: surface({ min: 0, max: 1.5, step: 0.05, unit: "mg/kg/hr", quickValues: [0.7], suggestedRate: 0.7 }), advisory: commonIbwAdvisory },
      { minimumAgeDays: age.years(12), maximumAgeDaysExclusive: PEDIATRIC_END, disposition: "AUTO", profile: surface({ min: 0, max: 1.5, step: 0.05, unit: "mg/kg/hr", quickValues: [0.5, 0.6, 0.7], suggestedRate: 0.5 }), advisory: commonIbwAdvisory },
    ],
  },
  {
    itemKey: "Nimodipine", sourceRefs: ["https://www.childrens.health.qld.gov.au/__data/assets/pdf_file/0020/218513/230602_CIDD-Guidelines.pdf"], bands: [
      { minimumAgeDays: 0, maximumAgeDaysExclusive: age.months(1), disposition: "LOCAL", profile: null, manualEntryOnly: true, advisory: "Central line only. Neonatal protocol required." },
      { minimumAgeDays: age.months(1), maximumAgeDaysExclusive: PEDIATRIC_END, minimumWeightKg: 0, minimumWeightInclusive: true, maximumWeightKg: 35, maximumWeightInclusive: true, disposition: "AUTO", profile: surface({ min: 0, max: 30, step: 1, unit: "mcg/kg/hr", quickValues: [15, 30], suggestedRate: 15 }), advisory: "Central line only; off-label/PICU profile. Use actual-weight bands." },
      { minimumAgeDays: age.months(1), maximumAgeDaysExclusive: PEDIATRIC_END, minimumWeightKg: 35, minimumWeightInclusive: false, maximumWeightKg: 70, maximumWeightInclusive: false, disposition: "AUTO", profile: surface({ min: 0, max: 1, step: 0.1, unit: "mg/hr", quickValues: [0.5, 1], suggestedRate: 0.5, weightBasis: "none" }), advisory: "Central line only; off-label/PICU profile. Use actual-weight bands." },
      { minimumAgeDays: age.months(1), maximumAgeDaysExclusive: PEDIATRIC_END, minimumWeightKg: 70, minimumWeightInclusive: true, disposition: "AUTO", profile: surface({ min: 0, max: 2, step: 0.1, unit: "mg/hr", quickValues: [1, 2], suggestedRate: 1, weightBasis: "none" }), advisory: "Central line only; off-label/PICU profile. Hard absolute maximum 2 mg/hr." },
    ],
  },
]

function checkedPayload(
  itemKey: string,
  band: ProfileBand,
): PediatricInfusionProfileRulePayload {
  const candidate = {
    kind: "PEDIATRIC_INFUSION_PROFILE",
    itemKey,
    labelEn: itemKey,
    labelBg: itemKey,
    category: null,
    disposition: band.disposition,
    routeDispositions: band.routeDispositions ?? {},
    manualEntryOnly: band.manualEntryOnly ?? band.profile == null,
    routeManualEntryOnly: band.routeManualEntryOnly ?? {},
    profile: band.profile,
    unit: null,
    routeUnits: {},
    manualUnit: band.manualUnit ?? null,
    minimumAgeDays: band.minimumAgeDays,
    maximumAgeDaysExclusive: band.maximumAgeDaysExclusive,
    minimumWeightKg: band.minimumWeightKg ?? null,
    minimumWeightInclusive: band.minimumWeightInclusive ?? true,
    maximumWeightKg: band.maximumWeightKg ?? null,
    maximumWeightInclusive: band.maximumWeightInclusive ?? false,
    routineSuggestion: band.routineSuggestion ?? true,
    advisory: band.advisory ?? null,
  }
  const parsed = validateClinicalRulePayload(candidate)
  if (!parsed.valid || parsed.value.kind !== "PEDIATRIC_INFUSION_PROFILE") {
    const detail = parsed.valid
      ? "Unexpected rule kind"
      : parsed.issues.map(issue => `${issue.field}: ${issue.message}`).join("; ")
    throw new Error(`Invalid pediatric infusion profile for ${itemKey}: ${detail}`)
  }
  return parsed.value
}

export function createPediatricInfusionProfileSeeds(): PediatricInfusionProfileSeed[] {
  const canonicalNames = new Set(INFUSION_CATALOG.map(entry => entry.name))
  const definedNames = new Set(definitions.map(definition => definition.itemKey))
  const missing = [...canonicalNames].filter(name => !definedNames.has(name))
  const unknown = [...definedNames].filter(name => !canonicalNames.has(name))
  if (missing.length || unknown.length || definitions.length !== INFUSION_CATALOG.length) {
    throw new Error(`Pediatric infusion catalog mismatch; missing=${missing.join(",")}; unknown=${unknown.join(",")}`)
  }
  return definitions.flatMap(definition => definition.bands.map(band => ({
    payload: checkedPayload(definition.itemKey, band),
    sourceRefs: [...definition.sourceRefs],
  })))
}

export const PEDIATRIC_INFUSION_PROFILE_ITEM_COUNT = definitions.length
export const PEDIATRIC_INFUSION_PROFILE_RULE_COUNT = definitions.reduce(
  (total, definition) => total + definition.bands.length,
  0,
)

if (PEDIATRIC_INFUSION_DISPOSITIONS.length !== 4) {
  throw new Error("Unexpected pediatric infusion disposition vocabulary")
}
