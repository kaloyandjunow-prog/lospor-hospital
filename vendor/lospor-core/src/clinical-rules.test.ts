import { describe, expect, it, vi } from "vitest"
import {
  LOSPOR_ADULT_RULESET_KEY,
  adultDoseProfilesFromRules,
  clinicalRuleKey,
  clinicalPresetRulesToEffective,
  createLosporAdultRulePayloads,
  createClinicalRulesSnapshotRepository,
  pediatricDoseProfilesFromRules,
  pediatricDrugProfilesFromRules,
  pediatricFluidProfilesFromRules,
  pediatricInfusionProfilesFromRules,
  applicablePediatricFluidProfiles,
  applicablePediatricInfusionProfiles,
  resolvePediatricDrugProfileSurface,
  resolvePediatricInfusionProfileSurface,
  resolveEffectiveClinicalRules,
  FIXED_EQUIPMENT_RULE_REJECTION_MESSAGE,
  RETIRED_DOSE_RULE_REJECTION_MESSAGE,
  isLegacyEquipmentRuleKind,
  validateClinicalRulePayload,
  validateClinicalRuleCollection,
  type ClinicalPresetRule,
  type InstitutionClinicalRuleOverrideDto,
} from "./clinical-rules"

const dosePayload = {
  kind: "PEDIATRIC_DRUG_DOSE" as const,
  medicationKey: "Propofol",
  labelEn: "Propofol",
  labelBg: "Propofol",
  inn: "propofol",
  indication: "Induction",
  route: "IV",
  minimumAgeDays: 365,
  maximumAgeDaysExclusive: 3650,
  basis: "TBW_KG" as const,
  amountPerUnit: 2,
  flatAmount: null,
  minimumAmount: null,
  maximumAmount: 100,
  roundTo: 1,
  doseUnit: "mg",
}

const pediatricProfileInput = {
  kind: "PEDIATRIC_DRUG_PROFILE" as const,
  medicationKey: "Atropine",
  labelEn: "Atropine",
  labelBg: "Atropine",
  inn: "atropine",
  category: "Antimuscarinic",
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 18 * 365.2425,
  profile: {
    routes: ["IV", "IM"],
    defaultRoute: "IV",
    routeModes: {
      IV: {
        min: 0,
        max: 2,
        step: 0.1,
        unit: "mg",
        quickValues: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
        doseCalc: { perKg: 0.01, basis: "TBW", roundTo: 0.1 },
      },
      IM: {
        min: 0,
        max: 2,
        step: 0.1,
        unit: "mg",
        quickValues: [0.1, 0.2, 0.3],
        doseCalc: { perKg: 0.02, basis: "TBW", roundTo: 0.1 },
      },
    },
  },
}

const pediatricFluidProfileInput = {
  kind: "PEDIATRIC_FLUID_PROFILE" as const,
  itemKey: "PLASMA_LYTE",
  labelEn: "Plasma-Lyte",
  labelBg: "Plasma-Lyte",
  category: "Crystalloids",
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 18 * 365.2425,
  profile: {
    min: 0,
    max: 2_000,
    step: 10,
    unit: "mL",
    fluidEntryModes: ["VOLUME", "RATE"],
    defaultFluidEntryMode: "RATE",
    fluidRate: {
      min: 1,
      max: 200,
      step: 1,
      allowManualOutsideRange: true,
      calculation: "HOLLIDAY_SEGAR_4_2_1",
    },
  },
}

const pediatricInfusionProfileInput = {
  kind: "PEDIATRIC_INFUSION_PROFILE" as const,
  itemKey: "Nimodipine",
  labelEn: "Nimodipine",
  labelBg: "Nimodipine",
  category: "Vasoactive",
  disposition: "AUTO" as const,
  routeDispositions: {},
  manualEntryOnly: false,
  routeManualEntryOnly: {},
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 18 * 365.2425,
  minimumWeightKg: null,
  minimumWeightInclusive: true,
  maximumWeightKg: 35,
  maximumWeightInclusive: true,
  routineSuggestion: true,
  advisory: "Use the weight-banded pediatric profile.",
  profile: {
    mode: "rate",
    min: 0,
    max: 1,
    step: 0.1,
    quickValues: [0.5, 1],
    unit: "mcg/kg/min",
    routes: ["IV"],
    defaultRoute: "IV",
    weightBasis: "TBW",
    suggestedRate: 0.5,
  },
}

describe("clinical rule payloads", () => {
  it("rejects the retired dose format and legacy equipment rules", () => {
    // PEDIATRIC_DRUG_DOSE was a second way to state a paediatric dose, with its
    // own arithmetic and no cover from the authoring scope guard. Authoring it
    // is closed; reading a stored one still works.
    expect(validateClinicalRulePayload(dosePayload)).toEqual({
      valid: false,
      issues: [{ field: "kind", message: RETIRED_DOSE_RULE_REJECTION_MESSAGE }],
    })
    for (const kind of [
      "ADULT_EQUIPMENT_PROFILE",
      "PEDIATRIC_EQUIPMENT",
      "PEDIATRIC_EQUIPMENT_POLICY",
    ]) {
      expect(isLegacyEquipmentRuleKind(kind)).toBe(true)
      expect(validateClinicalRulePayload({ kind })).toEqual({
        valid: false,
        issues: [{ field: "kind", message: FIXED_EQUIPMENT_RULE_REJECTION_MESSAGE }],
      })
    }
  })

  it("rejects an age band that ends before it starts", () => {
    // Moved onto the drug-profile kind: the dose kind this used to exercise is
    // no longer authorable, so its range checks are unreachable from here.
    const result = validateClinicalRulePayload({
      ...pediatricProfileInput,
      minimumAgeDays: 400,
      maximumAgeDaysExclusive: 100,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.issues.map(issue => issue.field)).toEqual(
        expect.arrayContaining(["maximumAgeDaysExclusive"]),
      )
    }
  })

  it("builds stable keys from clinical identity", () => {
    expect(clinicalRuleKey(dosePayload)).toBe(
      "PEDIATRIC_DRUG_DOSE:PROPOFOL:INDUCTION:IV:365-3650",
    )
  })

  it("validates one age-banded pediatric drug with route-specific surfaces", () => {
    const parsed = validateClinicalRulePayload(pediatricProfileInput)
    expect(parsed.valid).toBe(true)
    if (!parsed.valid || parsed.value.kind !== "PEDIATRIC_DRUG_PROFILE") return
    if (!parsed.value.profile) throw new Error("Expected selector profile")
    expect(parsed.value.availability).toBe("AUTO")
    expect(parsed.value.profile.defaultRoute).toBe("IV")
    expect(parsed.value.profile.routeModes?.IV.quickValues).toHaveLength(6)
    expect(clinicalRuleKey(parsed.value)).toBe("PEDIATRIC_DRUG_PROFILE:ATROPINE:0-6574.365")
  })

  it("supports weight-banded manual, local and hidden pediatric drug profiles", () => {
    const manual = validateClinicalRulePayload({
      ...pediatricProfileInput,
      availability: "MANUAL",
      minimumWeightKg: 10,
      maximumWeightKg: 20,
    })
    expect(manual.valid).toBe(true)
    if (!manual.valid || manual.value.kind !== "PEDIATRIC_DRUG_PROFILE") return
    expect(clinicalRuleKey(manual.value)).toBe(
      "PEDIATRIC_DRUG_PROFILE:ATROPINE:0-6574.365:GE10-LT20",
    )

    for (const availability of ["LOCAL", "HIDDEN"] as const) {
      const parsed = validateClinicalRulePayload({
        ...pediatricProfileInput,
        availability,
        profile: null,
        manualUnit: "mg",
      })
      expect(parsed.valid).toBe(true)
    }
  })

  it("requires calculations for AUTO pediatric drugs but not MANUAL drugs", () => {
    const profileWithoutCalculation = {
      ...pediatricProfileInput,
      profile: {
        ...pediatricProfileInput.profile,
        routeModes: {
          IV: { ...pediatricProfileInput.profile.routeModes.IV, doseCalc: undefined },
          IM: { ...pediatricProfileInput.profile.routeModes.IM, doseCalc: undefined },
        },
      },
    }
    expect(validateClinicalRulePayload(profileWithoutCalculation).valid).toBe(false)
    expect(validateClinicalRulePayload({
      ...profileWithoutCalculation,
      availability: "MANUAL",
    }).valid).toBe(true)
  })

  it("validates and projects age-banded pediatric fluid profiles through the same hierarchy", () => {
    const parsed = validateClinicalRulePayload(pediatricFluidProfileInput)
    expect(parsed.valid).toBe(true)
    if (!parsed.valid || parsed.value.kind !== "PEDIATRIC_FLUID_PROFILE") return
    expect(clinicalRuleKey(parsed.value)).toBe(
      "PEDIATRIC_FLUID_PROFILE:PLASMA_LYTE:0-6574.365",
    )
    const effective = clinicalPresetRulesToEffective("pediatric-fluid-user", "USER", [{
      id: "pediatric-fluid-rule",
      ruleKey: clinicalRuleKey(parsed.value),
      ruleVersion: "1.1",
      payload: parsed.value,
      sourceRefs: ["LOCAL_POLICY"],
    }])
    const profiles = pediatricFluidProfilesFromRules(effective)
    expect(profiles[0]).toMatchObject({
      itemKey: "PLASMA_LYTE",
      origin: "USER",
      presetId: "pediatric-fluid-user",
      profile: { defaultFluidEntryMode: "RATE" },
    })
    expect(applicablePediatricFluidProfiles({
      itemKey: "Plasma-Lyte",
      age: { value: 10, unit: "YEARS" },
      profiles,
    })).toHaveLength(1)
  })

  it("rejects rate entry on pediatric blood-product profiles", () => {
    const parsed = validateClinicalRulePayload({
      ...pediatricFluidProfileInput,
      itemKey: "PRBC",
      labelEn: "Packed red blood cells (PRBC)",
      category: "Blood products",
    })
    expect(parsed.valid).toBe(false)
    if (!parsed.valid) {
      expect(parsed.issues).toContainEqual({
        field: "profile.fluidEntryModes",
        message: "Blood products support volume entry only",
      })
    }
  })

  it("validates, selects and resolves weight-banded pediatric infusion profiles", () => {
    const parsed = validateClinicalRulePayload(pediatricInfusionProfileInput)
    expect(parsed.valid).toBe(true)
    if (!parsed.valid || parsed.value.kind !== "PEDIATRIC_INFUSION_PROFILE") return
    expect(clinicalRuleKey(parsed.value)).toBe(
      "PEDIATRIC_INFUSION_PROFILE:NIMODIPINE:0-6574.365:ANY-LE35",
    )
    const effective = clinicalPresetRulesToEffective("pediatric-infusion-platform", "PLATFORM", [{
      id: "pediatric-infusion-rule",
      ruleKey: clinicalRuleKey(parsed.value),
      ruleVersion: "1.1",
      payload: parsed.value,
      sourceRefs: ["LOCAL_POLICY"],
    }])
    const profiles = pediatricInfusionProfilesFromRules(effective)
    expect(applicablePediatricInfusionProfiles({
      itemKey: "Nimodipine",
      age: { value: 12, unit: "YEARS" },
      weightKg: 35,
      profiles,
    })).toHaveLength(1)
    expect(applicablePediatricInfusionProfiles({
      itemKey: "Nimodipine",
      age: { value: 12, unit: "YEARS" },
      weightKg: 35.1,
      profiles,
    })).toHaveLength(0)
    expect(resolvePediatricInfusionProfileSurface({ rule: profiles[0] })).toMatchObject({
      disposition: "AUTO",
      suggestedRate: 0.5,
      min: 0,
      max: 1,
      unit: "mcg/kg/min",
      ruleKey: clinicalRuleKey(parsed.value),
    })
  })

  it("rejects overlapping pediatric profile age bands at publication", () => {
    const first = validateClinicalRulePayload(pediatricProfileInput)
    const second = validateClinicalRulePayload({
      ...pediatricProfileInput,
      minimumAgeDays: 365,
      maximumAgeDaysExclusive: 730,
    })
    if (!first.valid || !second.valid) throw new Error("Test profile did not validate")
    const result = validateClinicalRuleCollection([
      { ruleKey: clinicalRuleKey(first.value), payload: first.value },
      { ruleKey: `${clinicalRuleKey(second.value)}:SECOND`, payload: second.value },
    ])
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.issues[0]?.message).toContain("overlaps")
  })

  it("projects profile provenance and resolves its default route without an indication", () => {
    const parsed = validateClinicalRulePayload(pediatricProfileInput)
    if (!parsed.valid || parsed.value.kind !== "PEDIATRIC_DRUG_PROFILE") {
      throw new Error("Test profile did not validate")
    }
    const effective = clinicalPresetRulesToEffective("preset-pediatric", "INSTITUTION", [{
      id: "profile-rule",
      ruleKey: clinicalRuleKey(parsed.value),
      ruleVersion: "2.1",
      payload: parsed.value,
      sourceRefs: ["LOCAL_POLICY"],
    }])
    const [profile] = pediatricDrugProfilesFromRules(effective)
    expect(profile?.sourceIds).toEqual([
      "preset:preset-pediatric",
      "rule:profile-rule",
      "LOCAL_POLICY",
    ])
    if (!profile) throw new Error("Missing projected profile")
    expect(resolvePediatricDrugProfileSurface({
      rule: profile,
      age: { value: 10, unit: "YEARS" },
      weightKg: 30,
      heightCm: 140,
      sex: "FEMALE",
    })).toMatchObject({
      route: "IV",
      dose: "0.3",
      ruleKey: "PEDIATRIC_DRUG_PROFILE:ATROPINE:0-6574.365",
    })
  })

  it("builds the complete canonical adult platform payload", () => {
    const payloads = createLosporAdultRulePayloads()
    expect(LOSPOR_ADULT_RULESET_KEY).toBe("LOSPOR_ADULTS")
    expect(payloads).toHaveLength(251)
    expect(payloads.filter(item => item.kind === "ADULT_DRUG_PROFILE")).toHaveLength(181)
    expect(payloads.filter(item => item.kind === "ADULT_INFUSION_PROFILE")).toHaveLength(48)
    expect(payloads.filter(item => item.kind === "ADULT_FLUID_PROFILE")).toHaveLength(22)

    for (const payload of payloads) expect(validateClinicalRulePayload(payload).valid).toBe(true)

    const buprenorphine = payloads.find(payload => (
      payload.kind === "ADULT_DRUG_PROFILE" && payload.itemKey === "Buprenorphine"
    ))
    const misoprostol = payloads.find(payload => (
      payload.kind === "ADULT_DRUG_PROFILE" && payload.itemKey === "Misoprostol"
    ))
    if (buprenorphine?.kind !== "ADULT_DRUG_PROFILE") throw new Error("Missing Buprenorphine")
    if (misoprostol?.kind !== "ADULT_DRUG_PROFILE") throw new Error("Missing Misoprostol")
    expect(buprenorphine.profile.routes).toContain("SL")
    expect(misoprostol.profile.routes).toContain("SL")
  })

  it("projects full copied rulesets without delta overlays", () => {
    const payload = createLosporAdultRulePayloads()[0]!
    const rules = clinicalPresetRulesToEffective("personal-1", "USER", [{
      id: "rule-1",
      ruleKey: clinicalRuleKey(payload),
      ruleVersion: "personal-1.1",
      payload,
      sourceRefs: [],
    }])
    expect(rules[0]?.origin).toBe("USER")
    expect(adultDoseProfilesFromRules(rules)[0]?.presetId).toBe("personal-1")
  })
})

describe("effective institution rules", () => {
  const presetRule: ClinicalPresetRule = {
    id: "preset-rule",
    ruleKey: clinicalRuleKey(dosePayload),
    ruleVersion: "preset-1.1",
    payload: dosePayload,
    sourceRefs: [],
  }

  function override(status: InstitutionClinicalRuleOverrideDto["status"]): InstitutionClinicalRuleOverrideDto {
    return {
      id: "override-1",
      institutionId: "institution-1",
      presetId: "preset-1",
      ruleKey: presetRule.ruleKey,
      baseRuleVersion: presetRule.ruleVersion,
      overrideVersion: "institution-1.1",
      payload: { ...dosePayload, amountPerUnit: 1.5 },
      sourceRefs: [],
      rationale: "Local policy",
      status,
      proposedById: "hod-1",
      proposedByName: "HOD",
      designatedReviewerId: "reviewer-1",
      designatedReviewerName: "Reviewer",
      designatedReviewedAt: null,
      hodApproverId: null,
      hodApproverName: null,
      hodApprovedAt: null,
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
    }
  }

  it("uses only approved institution overrides", () => {
    const pending = resolveEffectiveClinicalRules("preset-1", [presetRule], [override("PENDING")])
    expect(pending[0]?.origin).toBe("PRESET")
    expect(pediatricDoseProfilesFromRules(pending)[0]?.amountPerUnit).toBe(2)

    const approved = resolveEffectiveClinicalRules("preset-1", [presetRule], [override("APPROVED")])
    expect(approved[0]?.origin).toBe("INSTITUTION_OVERRIDE")
    expect(pediatricDoseProfilesFromRules(approved)[0]?.amountPerUnit).toBe(1.5)
  })

})
describe("clinical rule snapshot repository", () => {
  const response = {
    preset: { id: "preset-1", name: "Institution preset" },
    productionReady: false,
    effectiveRules: [],
    doseProfiles: [],
    pediatricFluidProfiles: [],
  }

  function storage(initial?: string) {
    let value = initial ?? null
    return {
      get: vi.fn(async () => value),
      set: vi.fn(async (_key: string, next: string) => {
        value = next
      }),
      delete: vi.fn(async () => {
        value = null
      }),
    }
  }

  it("uses the server and stores a timestamped snapshot", async () => {
    const adapter = storage()
    const repository = createClinicalRulesSnapshotRepository({
      cacheKey: "rules",
      fetchRules: vi.fn(async () => response),
      storage: adapter,
      now: () => new Date("2026-07-30T10:00:00.000Z"),
    })

    await expect(repository.load()).resolves.toMatchObject({
      source: "server",
      cachedAt: "2026-07-30T10:00:00.000Z",
      pediatricFluidProfiles: [],
    })
    expect(adapter.set).toHaveBeenCalledOnce()
  })

  it("uses the cached approved snapshot when refresh fails", async () => {
    const repository = createClinicalRulesSnapshotRepository({
      cacheKey: "rules",
      fetchRules: vi.fn(async () => {
        throw new Error("offline")
      }),
      storage: storage(JSON.stringify({
        cachedAt: "2026-07-30T09:00:00.000Z",
        response,
      })),
    })

    await expect(repository.load()).resolves.toMatchObject({
      source: "cache",
      preset: { id: "preset-1" },
      pediatricFluidProfiles: [],
    })
  })
})
