import type { PremedicationOrders } from "@lospor/core/premedication"
import { tciPatientFrom, type TciPatient } from "@lospor/core/tci"
import type {
  ClinicalMode,
  PediatricAgeInput,
  PediatricAgeUnit,
  PediatricFastingCategory,
} from "@lospor/core/pediatric"

export { useAllergyCheck } from "@/lib/use-allergy-check"

export type IntraopPreopSummary = {
  clinicalMode: ClinicalMode
  age?: number
  ageValue?: number
  ageUnit?: PediatricAgeUnit
  ageApproxDays?: number
  weight?: number
  height?: number
  sex?: string
  mallampati?: string
  neckMobility?: string
  mouthOpeningCm?: number
  cormackLehane?: string
  comorbidities?: { label: string; code?: string }[]
  currentMedications?: { label: string; atcCode?: string }[]
  allergies?: boolean | null
  allergyDetails?: unknown
  /** The child's nil-by-mouth assignment, read as clock times once surgery starts. */
  pediatricFasting?: { category: PediatricFastingCategory; hoursBefore: number }[]
  /** The premedication ordered at the preop visit; the record's premedication starts from it. */
  premedicationOrders?: PremedicationOrders
}

function numberOrUndefined(value: unknown): number | undefined {
  return value != null ? Number(value) : undefined
}

function premedicationOrdersOf(value: unknown): PremedicationOrders | undefined {
  if (!value || typeof value !== "object") return undefined
  const orders = value as Record<string, unknown>
  const text = (phase: string) => typeof orders[phase] === "string" ? orders[phase] as string : ""
  return { DAY_BEFORE: text("DAY_BEFORE"), MORNING: text("MORNING") }
}

export function buildIntraopPreopSummary(
  preop: Record<string, unknown> | null | undefined,
  clinicalMode: ClinicalMode = "ADULT",
): IntraopPreopSummary {
  const pd = preop ?? {}
  return {
    clinicalMode,
    age: numberOrUndefined(pd.ageYears) ?? numberOrUndefined(pd.age),
    ageValue: numberOrUndefined(pd.ageValue),
    ageUnit: pd.ageUnit === "DAYS" || pd.ageUnit === "MONTHS" || pd.ageUnit === "YEARS"
      ? pd.ageUnit
      : undefined,
    ageApproxDays: numberOrUndefined(pd.ageApproxDays),
    weight: numberOrUndefined(pd.weightKg) ?? numberOrUndefined(pd.weight),
    height: numberOrUndefined(pd.heightCm) ?? numberOrUndefined(pd.height),
    sex: typeof pd.sex === "string" ? pd.sex : undefined,
    mallampati: typeof pd.mallampati === "string" ? pd.mallampati : undefined,
    neckMobility: typeof pd.neckMobility === "string" ? pd.neckMobility : undefined,
    mouthOpeningCm: numberOrUndefined(pd.mouthOpeningCm),
    cormackLehane: typeof pd.cormackLehane === "string" ? pd.cormackLehane : undefined,
    comorbidities: Array.isArray(pd.comorbidities) ? pd.comorbidities as IntraopPreopSummary["comorbidities"] : [],
    currentMedications: Array.isArray(pd.currentMedications) ? pd.currentMedications as IntraopPreopSummary["currentMedications"] : [],
    // For the allergy check when a drug is given (1.5.0).
    allergies: typeof pd.allergies === "boolean" ? pd.allergies : null,
    allergyDetails: pd.allergyDetails,
    pediatricFasting: Array.isArray(pd.pediatricFasting)
      ? (pd.pediatricFasting as { category?: unknown; hoursBefore?: unknown }[])
        .filter((row): row is { category: PediatricFastingCategory; hoursBefore: number } =>
          typeof row?.category === "string" && typeof row.hoursBefore === "number")
      : undefined,
    premedicationOrders: premedicationOrdersOf(pd.preopPremedicationOrders),
  }
}
export function pediatricAgeFromPreop(
  preop: IntraopPreopSummary | null | undefined,
): PediatricAgeInput | null {
  if (preop?.clinicalMode !== "PEDIATRIC") return null
  if (
    preop.ageValue != null
    && Number.isFinite(preop.ageValue)
    && preop.ageUnit
  ) {
    return { value: preop.ageValue, unit: preop.ageUnit }
  }
  if (preop.ageApproxDays != null && Number.isFinite(preop.ageApproxDays)) {
    return { value: preop.ageApproxDays, unit: "DAYS" }
  }
  if (preop.age != null && Number.isFinite(preop.age)) {
    return { value: preop.age, unit: "YEARS" }
  }
  return null
}
/** The patient a TCI model is worked out for; null when age, weight, height or sex is missing (2026-10-18). */
export function tciPatientFromPreop(preop: IntraopPreopSummary | null | undefined): TciPatient | null {
  if (!preop) return null
  return tciPatientFrom({ ageYears: preop.age, ageValue: preop.ageValue, ageUnit: preop.ageUnit, weightKg: preop.weight, heightCm: preop.height, sex: preop.sex })
}
