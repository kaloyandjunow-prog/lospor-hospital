import {
  type DoseProfile,
} from "../catalog"
import {
  type CanonicalDoseUnit,
} from "../clinical-rule-vocabulary"
import {
  type PediatricRuleReviewStatus,
} from "../pediatric"
import {
  type PediatricDoseBasis,
} from "../pediatric-dose"
import {
  type PediatricRuleAgeBand,
  type PediatricRuleWeightBand,
} from "./internal"

export const CLINICAL_RULE_KINDS = [
  "PEDIATRIC_DRUG_DOSE",
  "PEDIATRIC_DRUG_PROFILE",
  "PEDIATRIC_DRUG_POLICY",
  "PEDIATRIC_FLUID_PROFILE",
  "PEDIATRIC_INFUSION_PROFILE",
  "ADULT_DRUG_PROFILE",
  "ADULT_INFUSION_PROFILE",
  "ADULT_FLUID_PROFILE",
] as const

export type ClinicalRuleKind = typeof CLINICAL_RULE_KINDS[number]

/** Legacy persisted kinds removed when equipment became fixed application guidance. */
export const LEGACY_EQUIPMENT_RULE_KINDS = [
  "ADULT_EQUIPMENT_PROFILE",
  "PEDIATRIC_EQUIPMENT",
  "PEDIATRIC_EQUIPMENT_POLICY",
] as const

export type LegacyEquipmentRuleKind = typeof LEGACY_EQUIPMENT_RULE_KINDS[number]

export const FIXED_EQUIPMENT_RULE_REJECTION_MESSAGE =
  "Equipment suggestions are globally fixed application guidance and cannot be edited through clinical rulesets."

export function isLegacyEquipmentRuleKind(value: unknown): value is LegacyEquipmentRuleKind {
  return typeof value === "string"
    && LEGACY_EQUIPMENT_RULE_KINDS.includes(value as LegacyEquipmentRuleKind)
}

/**
 * PEDIATRIC_DRUG_DOSE is retired for authoring.
 *
 * It was a second, independent way to state a paediatric dose, running in
 * parallel with PEDIATRIC_DRUG_PROFILE: its own age bands, its own arithmetic
 * (`amountPerUnit`/`flatAmount` rather than a `profile.doseCalc`), and its own
 * resolver. Two systems that can both produce a dose for the same drug can
 * disagree about it, and only one of them is covered by the authoring scope
 * guard — a dose written as this kind would bypass every per-kilogram, ceiling
 * and age-band protection that guards the other.
 *
 * No rule of this kind has ever been authored, so nothing is lost by closing
 * it. Reading stays supported: the runtime bundle keeps its `doseProfiles`
 * field, and any client still holding a cached snapshot keeps working.
 */
export const RETIRED_AUTHORING_RULE_KINDS = ["PEDIATRIC_DRUG_DOSE"] as const

export type RetiredAuthoringRuleKind = typeof RETIRED_AUTHORING_RULE_KINDS[number]

export const RETIRED_DOSE_RULE_REJECTION_MESSAGE =
  "Paediatric doses are authored as drug profiles, which carry the age bands, dose ceilings and scope "
  + "protections. This older dose format is no longer accepted."

export function isRetiredAuthoringRuleKind(value: unknown): value is RetiredAuthoringRuleKind {
  return typeof value === "string"
    && RETIRED_AUTHORING_RULE_KINDS.includes(value as RetiredAuthoringRuleKind)
}

export const DRUG_PROFILE_AVAILABILITIES = [
  "AUTO",
  "MANUAL",
  "LOCAL",
  "HIDDEN",
] as const

export type DrugProfileAvailability = typeof DRUG_PROFILE_AVAILABILITIES[number]

export type PediatricDrugDoseRulePayload = PediatricRuleAgeBand & {
  kind: "PEDIATRIC_DRUG_DOSE"
  medicationKey: string
  labelEn: string
  labelBg?: string | null
  inn?: string | null
  indication: string
  route: string
  basis: PediatricDoseBasis
  amountPerUnit?: number | null
  flatAmount?: number | null
  minimumAmount?: number | null
  maximumAmount?: number | null
  roundTo?: number | null
  doseUnit: string
}

export type PediatricDrugProfileRulePayload = PediatricRuleAgeBand & PediatricRuleWeightBand & {
  kind: "PEDIATRIC_DRUG_PROFILE"
  medicationKey: string
  labelEn: string
  labelBg?: string | null
  inn?: string | null
  category?: string | null
  /** Legacy stored profiles omit this and are interpreted as AUTO. */
  availability?: DrugProfileAvailability
  /** LOCAL/HIDDEN bands may deliberately have no platform selector surface. */
  profile: DoseProfile | null
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
  manualUnit?: string | null
}

export type PediatricFluidProfileRulePayload = PediatricRuleAgeBand & {
  kind: "PEDIATRIC_FLUID_PROFILE"
  itemKey: string
  labelEn: string
  labelBg?: string | null
  category?: string | null
  profile: DoseProfile
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
}

export const PEDIATRIC_INFUSION_DISPOSITIONS = DRUG_PROFILE_AVAILABILITIES

export type PediatricInfusionDisposition =
  typeof PEDIATRIC_INFUSION_DISPOSITIONS[number]

/**
 * One non-overlapping pediatric infusion surface. Separate rows are used for
 * age/weight bands so institution and personal overrides keep normal rule-key
 * semantics instead of replacing an opaque nested matrix.
 */
export type PediatricInfusionProfileRulePayload = PediatricRuleAgeBand & {
  kind: "PEDIATRIC_INFUSION_PROFILE"
  itemKey: string
  labelEn: string
  labelBg?: string | null
  category?: string | null
  disposition: PediatricInfusionDisposition
  routeDispositions: Record<string, PediatricInfusionDisposition>
  manualEntryOnly: boolean
  routeManualEntryOnly: Record<string, boolean>
  /** LOCAL/HIDDEN rows may deliberately have no platform slider surface. */
  profile: DoseProfile | null
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
  manualUnit?: string | null
  minimumWeightKg?: number | null
  minimumWeightInclusive?: boolean
  maximumWeightKg?: number | null
  maximumWeightInclusive?: boolean
  routineSuggestion?: boolean
  advisory?: string | null
}

export const PEDIATRIC_DRUG_POLICY_DISPOSITIONS = [
  "AUTOFILL_PROFILE",
  "MANUAL_PROFILE",
  "MANUAL_NO_PROFILE",
  "FORMULARY_REQUIRED",
  "SCHEMA_BLOCKED",
  "EXCLUDED",
  "PENDING_RESEARCH",
] as const

export type PediatricDrugPolicyDisposition =
  typeof PEDIATRIC_DRUG_POLICY_DISPOSITIONS[number]

export const PEDIATRIC_DRUG_POLICY_REVIEW_STATUSES = [
  "PENDING",
  "EVIDENCE_REVIEWED",
  "LOCAL_POLICY_REQUIRED",
  "APPROVED",
] as const

export type PediatricDrugPolicyReviewStatus =
  typeof PEDIATRIC_DRUG_POLICY_REVIEW_STATUSES[number]

/**
 * Draft/governance ledger entry for a catalog drug. Policy rows are deliberately
 * ignored by the runtime dose resolver; only PEDIATRIC_DRUG_PROFILE rows can
 * provide selector defaults, limits or pills.
 */
export type PediatricDrugPolicyRulePayload = {
  kind: "PEDIATRIC_DRUG_POLICY"
  medicationKey: string
  labelEn: string
  labelBg?: string | null
  inn?: string | null
  category?: string | null
  disposition: PediatricDrugPolicyDisposition
  reviewStatus: PediatricDrugPolicyReviewStatus
  rationaleEn: string
  rationaleBg?: string | null
}

export type AdultDoseProfileRuleKind =
  | "ADULT_DRUG_PROFILE"
  | "ADULT_INFUSION_PROFILE"
  | "ADULT_FLUID_PROFILE"

export type AdultDoseProfileRulePayload = {
  kind: AdultDoseProfileRuleKind
  itemKey: string
  labelEn: string
  labelBg?: string | null
  category?: string | null
  profile: DoseProfile
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
  /** Only applies to ADULT_DRUG_PROFILE. Legacy rows default to AUTO. */
  availability?: DrugProfileAvailability
}

export type ClinicalRulePayload =
  | PediatricDrugDoseRulePayload
  | PediatricDrugProfileRulePayload
  | PediatricDrugPolicyRulePayload
  | PediatricFluidProfileRulePayload
  | PediatricInfusionProfileRulePayload
  | AdultDoseProfileRulePayload
export type PediatricClinicalRulePayload =
  | PediatricDrugDoseRulePayload
  | PediatricDrugProfileRulePayload
  | PediatricDrugPolicyRulePayload
  | PediatricFluidProfileRulePayload
  | PediatricInfusionProfileRulePayload
export type ClinicalPresetStatus = "DRAFT" | "PUBLISHED" | "RETIRED"
export type ClinicalRuleOrigin = "PLATFORM" | "INSTITUTION" | "USER" | "PRESET" | "INSTITUTION_OVERRIDE"
export type ClinicalRuleMode = "ADULT" | "PEDIATRIC"
export type ClinicalPresetScope = "PLATFORM" | "INSTITUTION" | "USER"

export type ClinicalPresetRule = {
  id: string
  ruleKey: string
  ruleVersion: string
  payload: ClinicalRulePayload
  sourceRefs: string[]
}

export type EffectiveClinicalRule = ClinicalPresetRule & {
  origin: ClinicalRuleOrigin
  presetId: string
  overrideId?: string | null
}

export type ClinicalRulesetPublicationEvidenceDto = {
  baselinePresetId: string | null
  baselinePresetVersion: number | null
  reason: string | null
  contentSha256: string
  diffSha256: string
  exactDiff: unknown
  confirmedAt: string
}

export type ClinicalPresetDto = {
  id: string
  key: string
  name: string
  description: string | null
  clinicalMode: ClinicalRuleMode
  scope: ClinicalPresetScope
  ownerInstitutionId: string | null
  ownerInstitutionName: string | null
  ownerUserId: string | null
  ownerUserName: string | null
  copiedFromPresetId: string | null
  copiedFromVersion: number | null
  version: number
  status: ClinicalPresetStatus
  rules: ClinicalPresetRule[]
  assignedInstitutionCount: number
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  publicationEvidence?: ClinicalRulesetPublicationEvidenceDto | null
}

export type ClinicalRuleInstitutionDto = {
  id: string
  name: string
  city: string
  clinicalPresetId?: string
  clinicalPresetName?: string
}

export type ClinicalRulesetSelectionDto = {
  clinicalMode: ClinicalRuleMode
  platformPresetId: string | null
  institutionPresetId: string | null
  userPresetId: string | null
  effectivePresetId: string | null
  effectivePresetName: string | null
  effectiveScope: ClinicalPresetScope | null
  effectiveVersion: number | null
}

export type ClinicalRuleReviewerDto = {
  id: string
  name: string
  title: string | null
  role: string
}

export type InstitutionClinicalRuleOverrideDto = {
  id: string
  institutionId: string
  presetId: string
  ruleKey: string
  baseRuleVersion: string
  overrideVersion: string
  payload: ClinicalRulePayload
  sourceRefs: string[]
  rationale: string
  status: PediatricRuleReviewStatus
  proposedById: string | null
  proposedByName: string | null
  designatedReviewerId: string | null
  designatedReviewerName: string | null
  designatedReviewedAt: string | null
  hodApproverId: string | null
  hodApproverName: string | null
  hodApprovedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ClinicalRulesWorkbenchDto = {
  clinicalMode: ClinicalRuleMode
  actor: {
    id: string
    role: string
    institutionId: string | null
    institutionName: string | null
  }
  management: {
    activeScope: ClinicalPresetScope
    defaultScope: ClinicalPresetScope
    allowedScopes: ClinicalPresetScope[]
    ownerInstitutionId: string | null
    ownerInstitutionName: string | null
  }
  presets: ClinicalPresetDto[]
  institutions: ClinicalRuleInstitutionDto[]
  reviewers: ClinicalRuleReviewerDto[]
  overrides: InstitutionClinicalRuleOverrideDto[]
  effectiveRules: EffectiveClinicalRule[]
  selections: ClinicalRulesetSelectionDto[]
}
