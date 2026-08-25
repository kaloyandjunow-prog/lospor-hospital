import "server-only"

import { createHash } from "node:crypto"
import {
  clinicalRuleKey,
  validateClinicalRuleCollectionForPublication,
  validateClinicalRulePayload,
  type ClinicalRuleMode,
  type ClinicalRulePayload,
} from "@lospor/core/clinical-rules"
import {
  createLosporAdultV2Draft,
  createLosporPediatricV2Draft,
} from "@lospor/core/platform-clinical-drafts"
import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"

const baselineSelectionSelect = {
  preset: {
    select: {
      id: true,
      key: true,
      clinicalMode: true,
      scope: true,
      ownerInstitutionId: true,
      ownerUserId: true,
      version: true,
      status: true,
      publishedAt: true,
      rules: {
        orderBy: { ruleKey: "asc" as const },
        select: {
          ruleKey: true,
          payload: true,
          sourceRefs: true,
        },
      },
    },
  },
} satisfies Prisma.PlatformClinicalPresetSelectionSelect

export type ClinicalBaselineSelection = Prisma.PlatformClinicalPresetSelectionGetPayload<{
  select: typeof baselineSelectionSelect
}>

type Database = PrismaClient | Prisma.TransactionClient

export type ClinicalBaselineProfileCounts = {
  drug: number
  infusion: number
  fluid: number
  total: number
}

export type ClinicalBaselineIdentity = {
  presetId: string
  key: string
  version: number
  digestSha256: string
  ruleCount: number
  profileCounts: ClinicalBaselineProfileCounts
}

export type ClinicalBaselineReasonCode =
  | "READY"
  | "SELECTION_MISSING"
  | "IDENTITY_MISMATCH"
  | "VERSION_MISMATCH"
  | "NOT_PUBLISHED"
  | "RULE_COUNT_MISMATCH"
  | "RULES_INVALID"
  | "PROFILE_COUNT_MISMATCH"
  | "DIGEST_MISMATCH"

export type ClinicalBaselineReadiness = {
  mode: ClinicalRuleMode
  baselineReady: boolean
  reasonCode: ClinicalBaselineReasonCode
  expected: ClinicalBaselineIdentity
  selected: null | {
    presetId: string
    key: string
    version: number
    status: "DRAFT" | "PUBLISHED" | "RETIRED"
    digestSha256: string | null
    ruleCount: number
    profileCounts: ClinicalBaselineProfileCounts | null
  }
}

type ComparableRule = {
  ruleKey: string
  payload: unknown
  sourceRefs: string[]
}

type InspectedRules = {
  valid: true
  digestSha256: string
  profileCounts: ClinicalBaselineProfileCounts
} | { valid: false }

function persistedJson(value: unknown): unknown {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new Error("Clinical baseline contains a non-JSON value")
  return JSON.parse(serialized) as unknown
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value)
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Clinical baseline contains a non-finite number")
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`,
    ).join(",")}}`
  }
  throw new Error("Clinical baseline contains a non-JSON value")
}

function profileCounts(payloads: readonly ClinicalRulePayload[]): ClinicalBaselineProfileCounts {
  let drug = 0
  let infusion = 0
  let fluid = 0
  for (const payload of payloads) {
    if (payload.kind === "ADULT_DRUG_PROFILE" || payload.kind === "PEDIATRIC_DRUG_PROFILE") {
      drug += 1
    } else if (
      payload.kind === "ADULT_INFUSION_PROFILE"
      || payload.kind === "PEDIATRIC_INFUSION_PROFILE"
    ) {
      infusion += 1
    } else if (
      payload.kind === "ADULT_FLUID_PROFILE"
      || payload.kind === "PEDIATRIC_FLUID_PROFILE"
    ) {
      fluid += 1
    }
  }
  return { drug, infusion, fluid, total: drug + infusion + fluid }
}

function digestRules(input: {
  mode: ClinicalRuleMode
  presetId: string
  key: string
  version: number
  rules: readonly ComparableRule[]
}): string {
  const projection = persistedJson({
    mode: input.mode,
    presetId: input.presetId,
    key: input.key,
    version: input.version,
    rules: [...input.rules]
      .sort((left, right) => left.ruleKey < right.ruleKey ? -1 : left.ruleKey > right.ruleKey ? 1 : 0)
      .map(rule => ({
        ruleKey: rule.ruleKey,
        payload: rule.payload,
        sourceRefs: rule.sourceRefs,
      })),
  })
  return createHash("sha256").update(stableJson(projection), "utf8").digest("hex")
}

function inspectRules(input: {
  mode: ClinicalRuleMode
  presetId: string
  key: string
  version: number
  rules: readonly { ruleKey: string; payload: unknown; sourceRefs: unknown }[]
}): InspectedRules {
  const comparable: ComparableRule[] = []
  const payloads: ClinicalRulePayload[] = []
  const keys = new Set<string>()
  try {
    for (const rule of input.rules) {
      if (keys.has(rule.ruleKey) || !Array.isArray(rule.sourceRefs)
        || !rule.sourceRefs.every(item => typeof item === "string")) return { valid: false }
      const parsed = validateClinicalRulePayload(rule.payload)
      if (!parsed.valid || clinicalRuleKey(parsed.value) !== rule.ruleKey) return { valid: false }
      const ruleMode = parsed.value.kind.startsWith("ADULT_") ? "ADULT" : "PEDIATRIC"
      if (ruleMode !== input.mode) return { valid: false }
      keys.add(rule.ruleKey)
      payloads.push(parsed.value)
      comparable.push({
        ruleKey: rule.ruleKey,
        payload: persistedJson(rule.payload),
        sourceRefs: [...rule.sourceRefs],
      })
    }
    const publication = validateClinicalRuleCollectionForPublication(
      comparable.map((rule, index) => ({ ruleKey: rule.ruleKey, payload: payloads[index]! })),
    )
    if (!publication.valid) return { valid: false }
    return {
      valid: true,
      digestSha256: digestRules({ ...input, rules: comparable }),
      profileCounts: profileCounts(payloads),
    }
  } catch {
    return { valid: false }
  }
}

function sameProfileCounts(
  left: ClinicalBaselineProfileCounts,
  right: ClinicalBaselineProfileCounts,
): boolean {
  return left.drug === right.drug
    && left.infusion === right.infusion
    && left.fluid === right.fluid
    && left.total === right.total
}

function expectedBaseline(mode: ClinicalRuleMode): ClinicalBaselineIdentity {
  const draft = mode === "ADULT" ? createLosporAdultV2Draft() : createLosporPediatricV2Draft()
  if (draft.clinicalMode !== mode || draft.version !== 2 || !draft.publishable
    || draft.blockers.length > 0) {
    throw new Error(`Bundled ${mode} v2 clinical baseline is not publishable`)
  }
  const inspected = inspectRules({
    mode,
    presetId: draft.id,
    key: draft.key,
    version: draft.version,
    rules: draft.rules.map(rule => ({
      ruleKey: clinicalRuleKey(rule.payload),
      payload: rule.payload,
      sourceRefs: rule.sourceRefs,
    })),
  })
  if (!inspected.valid || inspected.profileCounts.total !== draft.rules.length) {
    throw new Error(`Bundled ${mode} v2 clinical baseline failed its exact-content check`)
  }
  return {
    presetId: draft.id,
    key: draft.key,
    version: draft.version,
    digestSha256: inspected.digestSha256,
    ruleCount: draft.rules.length,
    profileCounts: inspected.profileCounts,
  }
}

const EXPECTED_BASELINES = {
  ADULT: expectedBaseline("ADULT"),
  PEDIATRIC: expectedBaseline("PEDIATRIC"),
} as const

export function expectedHospitalClinicalBaseline(
  mode: ClinicalRuleMode,
): ClinicalBaselineIdentity {
  return EXPECTED_BASELINES[mode]
}

export function assessHospitalClinicalBaselineSelection(
  mode: ClinicalRuleMode,
  selection: ClinicalBaselineSelection | null,
): ClinicalBaselineReadiness {
  const expected = EXPECTED_BASELINES[mode]
  if (!selection) {
    return { mode, baselineReady: false, reasonCode: "SELECTION_MISSING", expected, selected: null }
  }
  const preset = selection.preset
  const selected: NonNullable<ClinicalBaselineReadiness["selected"]> = {
    presetId: preset.id,
    key: preset.key,
    version: preset.version,
    status: preset.status,
    digestSha256: null,
    ruleCount: preset.rules.length,
    profileCounts: null,
  }
  const result = (reasonCode: ClinicalBaselineReasonCode): ClinicalBaselineReadiness => ({
    mode,
    baselineReady: reasonCode === "READY",
    reasonCode,
    expected,
    selected,
  })
  if (preset.id !== expected.presetId || preset.key !== expected.key
    || preset.clinicalMode !== mode || preset.scope !== "PLATFORM"
    || preset.ownerInstitutionId !== null || preset.ownerUserId !== null) {
    return result("IDENTITY_MISMATCH")
  }
  if (preset.version !== expected.version) return result("VERSION_MISMATCH")
  if (preset.status !== "PUBLISHED" || !preset.publishedAt) return result("NOT_PUBLISHED")
  if (preset.rules.length !== expected.ruleCount) return result("RULE_COUNT_MISMATCH")
  const inspected = inspectRules({
    mode,
    presetId: preset.id,
    key: preset.key,
    version: preset.version,
    rules: preset.rules,
  })
  if (!inspected.valid) return result("RULES_INVALID")
  selected.digestSha256 = inspected.digestSha256
  selected.profileCounts = inspected.profileCounts
  if (!sameProfileCounts(inspected.profileCounts, expected.profileCounts)) {
    return result("PROFILE_COUNT_MISMATCH")
  }
  if (inspected.digestSha256 !== expected.digestSha256) return result("DIGEST_MISMATCH")
  return result("READY")
}

export async function assessSelectedHospitalClinicalBaseline(
  mode: ClinicalRuleMode,
  db: Database = prisma,
): Promise<ClinicalBaselineReadiness> {
  const selection = await db.platformClinicalPresetSelection.findUnique({
    where: { clinicalMode: mode },
    select: baselineSelectionSelect,
  })
  return assessHospitalClinicalBaselineSelection(mode, selection)
}

export async function assessHospitalClinicalBaselines(db: Database = prisma) {
  const [adult, pediatric] = await Promise.all([
    assessSelectedHospitalClinicalBaseline("ADULT", db),
    assessSelectedHospitalClinicalBaseline("PEDIATRIC", db),
  ])
  return { adult, pediatric }
}
