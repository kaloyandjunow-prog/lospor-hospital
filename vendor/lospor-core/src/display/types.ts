import type { LibraryCategory } from "../option-contracts"

export const CLINICAL_LOCALES = ["en", "bg"] as const

export type ClinicalLocale = (typeof CLINICAL_LOCALES)[number]

export type ClinicalDisplayDomain =
  | "ageUnit"
  | "boolean"
  | "carrierGas"
  | "caseStatus"
  | "clinicalMode"
  | "clinicalAttribute"
  | "cohortVisibility"
  | "complication"
  | "diagnosis"
  | "eventType"
  | "exportFormat"
  | "exportStatus"
  | "fieldPresence"
  | "labCategory"
  | "labFlag"
  | "labTest"
  | "mappingStatus"
  | "medication"
  | "optionGroup"
  | "procedure"
  | "qualityWarning"
  | "researchDomain"
  | "researchDistribution"
  | "researchField"
  | "researchMetric"
  | "researchSection"
  | "researchScope"
  | "scenarioGroup"
  | "userRole"
  | "ventilationMode"
  | `option:${LibraryCategory}`

export type ClinicalDisplayReviewStatus = "pending" | "approved"
export type BulgarianDisplaySource = "translated" | "international" | "fallback"

export type LocalizedClinicalText = {
  en: string
  bg: string
}

export type ClinicalDisplayTerm = {
  domain: ClinicalDisplayDomain
  code: string
  label: LocalizedClinicalText
  shortLabel?: LocalizedClinicalText
  description?: LocalizedClinicalText
  aliases?: readonly string[]
  reviewStatus: ClinicalDisplayReviewStatus
  bgSource: BulgarianDisplaySource
}

export type DynamicClinicalLabels = {
  label?: string | null
  labelEn?: string | null
  labelBg?: string | null
  description?: string | null
  descriptionEn?: string | null
  descriptionBg?: string | null
}

export type ResolvedClinicalDisplay = {
  domain: ClinicalDisplayDomain
  code: string
  label: string
  labelEn: string
  labelBg: string
  shortLabel?: string
  description?: string
  known: boolean
  reviewStatus: ClinicalDisplayReviewStatus
  bgSource: BulgarianDisplaySource
}
