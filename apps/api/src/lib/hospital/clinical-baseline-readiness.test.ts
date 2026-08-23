import { describe, expect, it, vi } from "vitest"
import {
  clinicalRuleKey,
  validateClinicalRulePayload,
} from "@lospor/core/clinical-rules"
import {
  createLosporAdultV2Draft,
  createLosporPediatricV2Draft,
} from "@lospor/core/platform-clinical-drafts"
import type { ClinicalBaselineSelection } from "./clinical-baseline-readiness"

vi.mock("server-only", () => ({}))

function canonicalSelection(
  mode: "ADULT" | "PEDIATRIC",
): ClinicalBaselineSelection {
  const draft = mode === "ADULT" ? createLosporAdultV2Draft() : createLosporPediatricV2Draft()
  return {
    preset: {
      id: draft.id,
      key: draft.key,
      clinicalMode: draft.clinicalMode,
      scope: "PLATFORM",
      ownerInstitutionId: null,
      ownerUserId: null,
      version: draft.version,
      status: "PUBLISHED",
      publishedAt: new Date("2026-08-23T08:00:00.000Z"),
      rules: draft.rules.map(rule => ({
        ruleKey: clinicalRuleKey(rule.payload),
        payload: JSON.parse(JSON.stringify(rule.payload)) as never,
        sourceRefs: [...rule.sourceRefs],
      })),
    },
  }
}

function clone(selection: ClinicalBaselineSelection): ClinicalBaselineSelection {
  return structuredClone(selection)
}

describe("Hospital selected clinical baseline readiness", () => {
  it("pins exact source-controlled v2 identities, digests, and profile counts", async () => {
    const { expectedHospitalClinicalBaseline } = await import("./clinical-baseline-readiness")
    for (const mode of ["ADULT", "PEDIATRIC"] as const) {
      const expected = expectedHospitalClinicalBaseline(mode)
      expect(expected.version).toBe(2)
      expect(expected.digestSha256).toMatch(/^[a-f0-9]{64}$/)
      expect(expected.ruleCount).toBeGreaterThan(0)
      expect(expected.profileCounts.total).toBe(expected.ruleCount)
      expect(expected.profileCounts.drug).toBeGreaterThan(0)
      expect(expected.profileCounts.infusion).toBeGreaterThan(0)
      expect(expected.profileCounts.fluid).toBeGreaterThan(0)
    }
  })

  it("reports a missing platform selection as not ready", async () => {
    const { assessHospitalClinicalBaselineSelection } = await import("./clinical-baseline-readiness")
    expect(assessHospitalClinicalBaselineSelection("ADULT", null)).toMatchObject({
      mode: "ADULT",
      baselineReady: false,
      reasonCode: "SELECTION_MISSING",
      selected: null,
    })
  })

  it.each(["ADULT", "PEDIATRIC"] as const)(
    "accepts only the exact published %s v2 source snapshot",
    async mode => {
      const { assessHospitalClinicalBaselineSelection } = await import("./clinical-baseline-readiness")
      const result = assessHospitalClinicalBaselineSelection(mode, canonicalSelection(mode))
      expect(result).toMatchObject({
        mode,
        baselineReady: true,
        reasonCode: "READY",
        selected: {
          presetId: result.expected.presetId,
          key: result.expected.key,
          version: 2,
          status: "PUBLISHED",
          digestSha256: result.expected.digestSha256,
          ruleCount: result.expected.ruleCount,
          profileCounts: result.expected.profileCounts,
        },
      })
    },
  )

  it("fails closed on wrong identity, version, scope, ownership, or publication state", async () => {
    const { assessHospitalClinicalBaselineSelection } = await import("./clinical-baseline-readiness")
    const changes: Array<{
      mutate: (selection: ClinicalBaselineSelection) => void
      reasonCode: string
    }> = [
      { mutate: value => { value.preset.id = "lookalike-adult-v2" }, reasonCode: "IDENTITY_MISMATCH" },
      { mutate: value => { value.preset.key = "LOOKALIKE" }, reasonCode: "IDENTITY_MISMATCH" },
      { mutate: value => { value.preset.scope = "INSTITUTION" }, reasonCode: "IDENTITY_MISMATCH" },
      { mutate: value => { value.preset.ownerUserId = "owner-1" }, reasonCode: "IDENTITY_MISMATCH" },
      { mutate: value => { value.preset.version = 1 }, reasonCode: "VERSION_MISMATCH" },
      { mutate: value => { value.preset.status = "DRAFT" }, reasonCode: "NOT_PUBLISHED" },
      { mutate: value => { value.preset.publishedAt = null }, reasonCode: "NOT_PUBLISHED" },
    ]
    for (const change of changes) {
      const selection = clone(canonicalSelection("ADULT"))
      change.mutate(selection)
      expect(assessHospitalClinicalBaselineSelection("ADULT", selection)).toMatchObject({
        baselineReady: false,
        reasonCode: change.reasonCode,
      })
    }
  })

  it("distinguishes rule-count, invalid-rule, profile-count, and digest drift", async () => {
    const { assessHospitalClinicalBaselineSelection } = await import("./clinical-baseline-readiness")

    const missingRule = clone(canonicalSelection("ADULT"))
    missingRule.preset.rules.pop()
    expect(assessHospitalClinicalBaselineSelection("ADULT", missingRule).reasonCode)
      .toBe("RULE_COUNT_MISMATCH")

    const wrongKey = clone(canonicalSelection("ADULT"))
    wrongKey.preset.rules[0]!.ruleKey = "ADULT_DRUG_PROFILE:WRONG"
    expect(assessHospitalClinicalBaselineSelection("ADULT", wrongKey).reasonCode)
      .toBe("RULES_INVALID")

    const malformedSources = clone(canonicalSelection("ADULT"))
    malformedSources.preset.rules[0]!.sourceRefs = [42] as never
    expect(assessHospitalClinicalBaselineSelection("ADULT", malformedSources).reasonCode)
      .toBe("RULES_INVALID")

    const changedKind = clone(canonicalSelection("ADULT"))
    const existingInfusion = changedKind.preset.rules.find(rule =>
      (rule.payload as { kind?: string }).kind === "ADULT_INFUSION_PROFILE",
    )!
    const candidate = {
      ...(existingInfusion.payload as Record<string, unknown>),
      itemKey: "READINESS_PROFILE_COUNT_TEST",
      labelEn: "Readiness profile count test",
    }
    const parsed = validateClinicalRulePayload(candidate)
    if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues))
    changedKind.preset.rules[0] = {
      ruleKey: clinicalRuleKey(parsed.value),
      payload: candidate as never,
      sourceRefs: [],
    }
    expect(assessHospitalClinicalBaselineSelection("ADULT", changedKind).reasonCode)
      .toBe("PROFILE_COUNT_MISMATCH")

    const changedSource = clone(canonicalSelection("PEDIATRIC"))
    changedSource.preset.rules[0]!.sourceRefs = [
      ...(changedSource.preset.rules[0]!.sourceRefs as string[]),
      "readiness-digest-test",
    ]
    expect(assessHospitalClinicalBaselineSelection("PEDIATRIC", changedSource).reasonCode)
      .toBe("DIGEST_MISMATCH")
  })

  it("is independent of database row order and exposes no rule, source, name, or actor data", async () => {
    const { assessHospitalClinicalBaselineSelection } = await import("./clinical-baseline-readiness")
    const selection = canonicalSelection("PEDIATRIC")
    selection.preset.rules.reverse()
    const result = assessHospitalClinicalBaselineSelection("PEDIATRIC", selection)
    expect(result.baselineReady).toBe(true)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("payload")
    expect(serialized).not.toContain("sourceRefs")
    expect(serialized).not.toContain("publishedAt")
    expect(serialized).not.toContain("selectedBy")
    expect(serialized).not.toContain("LOSPOR pediatric drugs profile")
  })

  it("queries only the requested platform mode and assesses the returned row", async () => {
    const { assessSelectedHospitalClinicalBaseline } = await import("./clinical-baseline-readiness")
    const findUnique = vi.fn(async () => canonicalSelection("ADULT"))
    const db = { platformClinicalPresetSelection: { findUnique } }
    await expect(assessSelectedHospitalClinicalBaseline("ADULT", db as never))
      .resolves.toMatchObject({ baselineReady: true, reasonCode: "READY" })
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { clinicalMode: "ADULT" },
    }))
  })
})
