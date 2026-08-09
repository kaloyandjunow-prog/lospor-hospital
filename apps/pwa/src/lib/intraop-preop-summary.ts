import type {
  ClinicalMode,
  PediatricAgeInput,
  PediatricAgeUnit,
} from "@lospor/core/pediatric"

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
}

function numberOrUndefined(value: unknown): number | undefined {
  return value != null ? Number(value) : undefined
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