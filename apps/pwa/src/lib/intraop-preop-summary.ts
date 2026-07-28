export type IntraopPreopSummary = {
  age?: number
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

export function buildIntraopPreopSummary(preop: Record<string, unknown> | null | undefined): IntraopPreopSummary {
  const pd = preop ?? {}
  return {
    age: numberOrUndefined(pd.ageYears) ?? numberOrUndefined(pd.age),
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
