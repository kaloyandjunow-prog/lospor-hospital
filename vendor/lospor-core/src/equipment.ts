import { resolveIdealBodyWeight } from "./ideal-body-weight"
import {
  normalizePediatricAge,
  type ClinicalMode,
  type NormalizedPediatricAge,
  type PediatricAgeInput,
} from "./pediatric"
import { suggestsDifficultAirwayEquipment, type AirwayFindings } from "./risk"

export const EQUIPMENT_GUIDANCE_VERSION = "LOSPOR_FIXED_EQUIPMENT_2026_08_01" as const

export const EQUIPMENT_GUIDANCE_SOURCE_REFS = [
  "LOSPOR_ADULT_EQUIPMENT_V7_3",
  "https://www.anzcor.org/home/paediatric-advanced-life-support/guideline-12-2-paediatric-advanced-life-support-pals",
  "https://www.teleflex.com/la/en/product-areas/anesthesia/airway-management/lma-airways/",
  "https://www.aarc.org/wp-content/uploads/2022/10/cpg-artificial-airway-suctioning.pdf",
  "https://www.resus.org.uk/library/quality-standards-cpr/acute-care-equipment-and-drug-lists",
  "https://www.cdc.gov/growthcharts/cdc-data-files.htm",
] as const

export interface EquipmentInput {
  clinicalMode: ClinicalMode
  /** Precise pediatric age. Preferred over ageYears when both are supplied. */
  age?: PediatricAgeInput | null
  /** Compatibility input for existing preoperative forms. */
  ageYears?: number | null
  weightKg?: number | null
  heightCm?: number | null
  sex?: string | null
  bmi?: number | null
  preterm?: boolean | null
  airway?: AirwayFindings | null
}

export interface EquipmentItem { label: string; value: string; note?: string }
export interface EquipmentCategory { cat: string; color: string; items: EquipmentItem[] }

function isPositive(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2
}

function formatHalf(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value)
}

function difficultAirwayCategories(
  input: EquipmentInput,
  backupEttValue: string,
): EquipmentCategory[] {
  if (!input.airway || !suggestsDifficultAirwayEquipment(input.airway)) return []
  return [{
    cat: "Difficult Airway",
    color: "#ef4444",
    items: [
      { label: "Video laryngoscope", value: "Have available", note: "from today's airway exam" },
      { label: "Bougie / stylet", value: "Have available" },
      { label: "Backup ETT", value: backupEttValue },
      { label: "Difficult airway trolley", value: "Confirm location" },
    ],
  }]
}

/**
 * The established adult equipment panel. Keep this calculation stable: it is
 * fixed application guidance, not a clinical-ruleset surface.
 */
function adultEquipment(input: EquipmentInput): EquipmentCategory[] {
  const weight = input.weightKg ?? null
  const height = input.heightCm ?? null
  const sex = input.sex ?? "OTHER"
  const bmi = input.bmi ?? (weight && height ? weight / ((height / 100) ** 2) : null)
  const w = weight ?? 70
  const isFemale = sex === "FEMALE" || sex === "F"
  const ibwKg = !height
    ? null
    : Math.max((isFemale ? 45.5 : 50) + 0.906 * (height - 152.4), 0)

  const ettSize = isFemale ? 7.5 : 8.0
  const ettDepth = height ? Math.round(height / 10 + (isFemale ? 1 : 2)) : ettSize * 3

  function lmaSize(): string {
    if (w < 5) return "1"
    if (w < 10) return "1.5"
    if (w < 20) return "2"
    if (w < 30) return "2.5"
    if (w < 50) return "3"
    if (w < 70) return "4"
    if (w < 100) return "5"
    return "6"
  }

  function guedel(): string {
    if (w < 3) return "00"
    if (w < 5) return "0"
    if (w < 10) return "1"
    if (w < 20) return "2"
    if (w < 35) return "3"
    if (w < 60) return "4"
    if (w < 90) return "5"
    return "6"
  }

  function laryngoscope(): string {
    if (isFemale || w < 60) return "Mac 3"
    if (w > 100 || (height && height > 185)) return "Mac 4"
    return "Mac 3"
  }

  const ngtDepth = !height
    ? ""
    : `${Math.round(50 + (height - 160) * 0.25)} cm`

  return [
    {
      cat: "Airway", color: "#3b82f6",
      items: [
        { label: "ETT size", value: `${ettSize}`, note: "cuffed" },
        { label: "ETT depth (lip)", value: `${ettDepth} cm` },
        { label: "LMA size", value: lmaSize() },
        { label: "Laryngoscope", value: laryngoscope() },
        { label: "Guedel OPA", value: `Size ${guedel()}` },
        { label: "Suction catheter", value: ettSize <= 7.0 ? "12 Fr" : "14 Fr" },
      ],
    },
    {
      cat: "Ventilation", color: "#14b8a6",
      items: [
        {
          label: "Tidal volume",
          value: `${Math.round((ibwKg ?? w) * 6)}–${Math.round((ibwKg ?? w) * 8)} mL`,
          note: "6–8 mL/kg IBW",
        },
        { label: "Rate", value: "10–16 /min" },
        { label: "PEEP", value: bmi && bmi >= 30 ? "8–10 cmH₂O" : "5 cmH₂O" },
        { label: "I:E ratio", value: "1:2" },
      ],
    },
    {
      cat: "Fluids", color: "#0ea5e9",
      items: [{
        label: "Maintenance",
        value: `${Math.round(w <= 10 ? w * 4 : w <= 20 ? 40 + (w - 10) * 2 : 60 + (w - 20))} mL/hr`,
        note: "4-2-1 rule",
      }],
    },
    {
      cat: "Catheters", color: "#f59e0b",
      items: [
        { label: "Urinary catheter", value: isFemale ? "12–14 Fr" : "14–16 Fr" },
        {
          label: "NGT",
          value: isFemale ? "14 Fr" : "16 Fr",
          note: ngtDepth ? `~${ngtDepth} insertion depth` : undefined,
        },
      ],
    },
    {
      cat: "Monitoring", color: "#22c55e",
      items: [
        {
          label: "BP cuff",
          value: bmi && bmi >= 40
            ? "Large adult / Thigh cuff"
            : bmi && bmi >= 30
              ? "Large adult (15–20 cm)"
              : "Adult (12–15 cm)",
        },
        { label: "Defibrillator", value: "Adult pads" },
      ],
    },
    ...difficultAirwayCategories(input, `${ettSize - 0.5} (0.5 smaller)`),
  ]
}

function pediatricAge(input: EquipmentInput): {
  source: PediatricAgeInput
  normalized: NormalizedPediatricAge
} | null {
  const source = input.age ?? (
    input.ageYears != null && Number.isFinite(input.ageYears) && input.ageYears >= 0
      ? { value: input.ageYears, unit: "YEARS" as const }
      : null
  )
  if (!source) return null
  const normalized = normalizePediatricAge(source)
  return normalized ? { source, normalized } : null
}

function pediatricLma(weightKg: number | null): EquipmentItem {
  if (!isPositive(weightKg)) {
    return {
      label: "LMA size",
      value: "Weight required",
      note: "Use the selected manufacturer's weight bands and verify the current product IFU",
    }
  }
  const size = weightKg < 5
    ? "1"
    : weightKg < 10
      ? "1.5"
      : weightKg < 20
        ? "2"
        : weightKg < 30
          ? "2.5"
          : weightKg < 50
            ? "3"
            : weightKg < 70
              ? "4"
              : weightKg < 100
                ? "5"
                : "6"
  return {
    label: "LMA size",
    value: `Size ${size}`,
    note: "Manufacturer weight-band starting point; verify the actual product and current IFU",
  }
}

function pediatricRate(age: NormalizedPediatricAge | null): EquipmentItem {
  if (!age) return { label: "Rate", value: "Age required" }
  const days = age.approximateDays
  const value = days < 365.2425 / 12
    ? "40–60 /min"
    : days < 365.2425
      ? "30–40 /min"
      : days < 3 * 365.2425
        ? "24–30 /min"
        : days < 8 * 365.2425
          ? "18–24 /min"
          : "14–18 /min"
  return { label: "Rate", value }
}

function maintenance(weightKg: number | null): EquipmentItem {
  if (!isPositive(weightKg)) {
    return { label: "Maintenance", value: "Weight required", note: "4-2-1 rule" }
  }
  return {
    label: "Maintenance",
    value: `${Math.round(weightKg <= 10
      ? weightKg * 4
      : weightKg <= 20
        ? 40 + (weightKg - 10) * 2
        : 60 + (weightKg - 20))} mL/hr`,
    note: "4-2-1 rule",
  }
}

function pediatricEquipment(input: EquipmentInput): EquipmentCategory[] {
  const age = pediatricAge(input)
  const weight = isPositive(input.weightKg) ? input.weightKg : null
  const underTwo = age != null && age.normalized.approximateDays < 2 * 365.2425
  const ageYears = age?.normalized.approximateDays == null
    ? null
    : age.normalized.approximateDays / 365.2425

  const cuffedEtt = ageYears != null && !underTwo
    ? roundHalf(ageYears / 4 + 3.5)
    : null
  const uncuffedEtt = ageYears != null && !underTwo
    ? roundHalf(ageYears / 4 + 4)
    : null
  const ettDepth = ageYears != null && !underTwo
    ? roundHalf(ageYears / 2 + 12)
    : null

  const ettSize: EquipmentItem = cuffedEtt != null && uncuffedEtt != null
    ? {
        label: "ETT size",
        value: `${formatHalf(cuffedEtt)} cuffed / ${formatHalf(uncuffedEtt)} uncuffed`,
        note: "Starting estimate; prepare planned ID ±0.5 mm and confirm patient/product factors",
      }
    : {
        label: "ETT size",
        value: "Manual selection",
        note: age
          ? "Under 2 years: prepare the clinically planned ID ±0.5 mm"
          : "Enter age; under 2 years remains manual and requires the planned ID ±0.5 mm",
      }
  const ettDepthItem: EquipmentItem = ettDepth != null
    ? {
        label: "ETT depth (lip)",
        value: `${formatHalf(ettDepth)} cm`,
        note: "Oral starting estimate (age/2 + 12); confirm clinically",
      }
    : {
        label: "ETT depth (lip)",
        value: "Manual selection",
        note: age ? "Under 2 years: select and confirm depth clinically" : "Enter age; confirm depth clinically",
      }

  const ibw = resolveIdealBodyWeight({
    clinicalMode: "PEDIATRIC",
    heightCm: input.heightCm,
    sex: input.sex,
    age: age?.source ?? null,
    preterm: input.preterm,
  })
  const tidalVolume: EquipmentItem = ibw.available
    ? {
        label: "Tidal volume",
        value: `${Math.round(ibw.kilograms * 6)}–${Math.round(ibw.kilograms * 8)} mL`,
        note: "6–8 mL/kg McLaren IBW",
      }
    : {
        label: "Tidal volume",
        value: "IBW unavailable",
        note: "Enter pediatric age, sex and height for McLaren IBW",
      }

  const defibrillator: EquipmentItem = weight == null
    ? {
        label: "Defibrillator",
        value: "Verify AED mode and pad placement",
        note: "Enter weight to distinguish pediatric and standard AED mode; energy is shown only in the resuscitation calculator",
      }
    : weight < 25
      ? {
          label: "Defibrillator",
          value: "Pediatric AED mode if available; adult pads anteroposterior",
          note: "Pediatric pads may be anterolateral only if they do not touch; verify device IFU; no energy shown here",
        }
      : {
          label: "Defibrillator",
          value: "Standard adult AED mode; anterolateral or anteroposterior pads",
          note: "Avoid pad contact and breast tissue; verify device IFU; no energy shown here",
        }

  const backupEtt = cuffedEtt == null
    ? "Prepare 0.5 mm smaller than the clinically planned ETT"
    : `${formatHalf(Math.max(cuffedEtt - 0.5, 0.5))} cuffed (0.5 mm smaller)`

  return [
    {
      cat: "Airway", color: "#3b82f6",
      items: [
        ettSize,
        ettDepthItem,
        pediatricLma(weight),
        {
          label: "Laryngoscope",
          value: age == null
            ? "Age required; choose exact blade manually"
            : underTwo && age.normalized.approximateDays < 365.2425
              ? "Prepare a straight blade; choose exact size manually"
              : "Prepare a curved blade; choose exact size manually",
          note: "Anatomy, operator and available direct/video system override",
        },
        {
          label: "Guedel OPA",
          value: "Measure manually",
          note: "Measure from the centre of the incisors to the angle of the mandible; verify product markings",
        },
        {
          label: "Suction catheter",
          value: "Calculate manually from actual ETT ID",
          note: "Catheter occlusion should remain below the applicable fraction of the ETT lumen",
        },
      ],
    },
    {
      cat: "Ventilation", color: "#14b8a6",
      items: [
        tidalVolume,
        pediatricRate(age?.normalized ?? null),
        { label: "PEEP", value: "5 cmH₂O", note: "Starting suggestion; adjust clinically" },
        { label: "I:E ratio", value: "1:2" },
      ],
    },
    {
      cat: "Fluids", color: "#0ea5e9",
      items: [maintenance(weight)],
    },
    {
      cat: "Catheters", color: "#f59e0b",
      items: [
        { label: "Urinary catheter", value: "Select manually", note: "Base selection on anatomy, indication and local product range" },
        { label: "NGT", value: "Select and measure manually", note: "Confirm size and insertion depth clinically" },
      ],
    },
    {
      cat: "Monitoring", color: "#22c55e",
      items: [
        {
          label: "BP cuff",
          value: "Measure mid-upper-arm circumference",
          note: "Select the smallest compatible cuff whose printed range includes the measurement",
        },
        defibrillator,
      ],
    },
    ...difficultAirwayCategories(input, backupEtt),
  ]
}

/**
 * Resolves the fixed application-wide equipment guidance. `clinicalMode` is
 * mandatory so an absent or unusual age can never silently choose another
 * clinical pathway.
 */
export function calcEquipment(input: EquipmentInput): EquipmentCategory[] {
  return input.clinicalMode === "PEDIATRIC"
    ? pediatricEquipment(input)
    : adultEquipment(input)
}
