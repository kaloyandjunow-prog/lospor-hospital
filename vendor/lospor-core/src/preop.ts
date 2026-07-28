export type TaggedClinicalItem = {
  label: string
  code?: string
  sub?: string
  system?: string
  sourceVocabulary?: string
  sourceCode?: string
  standardConceptId?: number
  mappingStatus?: string
}

export const ICD10_BODY_SYSTEMS = [
  "Cardiovascular",
  "Respiratory",
  "Neurological / Psychiatric",
  "Endocrine / Metabolic",
  "Gastrointestinal / Hepatic",
  "Renal / Urological",
  "Haematological",
  "Musculoskeletal",
  "Neoplasms",
  "Infectious diseases",
  "Ophthalmological / ENT",
  "Obstetric",
  "Congenital",
  "Other",
] as const

export type BodySystem = (typeof ICD10_BODY_SYSTEMS)[number]
export const ICD10_BODY_SYSTEM_ORDER: readonly BodySystem[] = ICD10_BODY_SYSTEMS

export function getIcd10BodySystem(code: string): BodySystem {
  if (!code) return "Other"
  const p1 = code.trim().charAt(0).toUpperCase()
  const num = parseInt(code.trim().slice(1, 3), 10) || 0
  if (p1 === "I") return "Cardiovascular"
  if (p1 === "J") return "Respiratory"
  if (p1 === "G" || p1 === "F") return "Neurological / Psychiatric"
  if (p1 === "E") return "Endocrine / Metabolic"
  if (p1 === "K") return "Gastrointestinal / Hepatic"
  if (p1 === "N") return "Renal / Urological"
  if (p1 === "C") return "Neoplasms"
  if (p1 === "D") return num >= 50 && num <= 89 ? "Haematological" : "Neoplasms"
  if (p1 === "M") return "Musculoskeletal"
  if (p1 === "A" || p1 === "B") return "Infectious diseases"
  if (p1 === "H") return "Ophthalmological / ENT"
  if (p1 === "O") return "Obstetric"
  if (p1 === "Q") return "Congenital"
  return "Other"
}

export const getBodySystem = getIcd10BodySystem
export const SYSTEM_ORDER = ICD10_BODY_SYSTEM_ORDER
