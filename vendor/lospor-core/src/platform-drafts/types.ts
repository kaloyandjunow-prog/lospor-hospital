import { clinicalRuleKey } from "../clinical-rules"
import type {
  ClinicalRulePayload,
  PediatricDrugPolicyDisposition,
} from "../clinical-rules"

/**
 * The shape every platform clinical draft has, and the identifiers that name
 * them. Split out of platform-clinical-drafts.ts so the adult and pediatric
 * seed builders -- which are large, mostly-data modules that share nothing
 * with each other -- can sit in their own files without importing one another
 * just to reach a type.
 */

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

export type DrugPolicyOverride = {
  disposition: PediatricDrugPolicyDisposition
  rationaleEn: string
}

export function clinicalDraftRuleKeys(draft: PlatformClinicalDraft): string[] {
  return draft.rules.map(rule => clinicalRuleKey(rule.payload))
}
