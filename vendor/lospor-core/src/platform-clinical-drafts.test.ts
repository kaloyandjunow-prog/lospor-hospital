import { describe, expect, it } from "vitest"
import { DRUG_CATALOG, FLUID_CATALOG, INFUSION_CATALOG, parseDoseProfile } from "./catalog"
import {
  applicablePediatricFluidProfiles,
  type AdultDoseProfileRulePayload,
  clinicalPresetRulesToEffective,
  clinicalRuleKey,
  createLosporAdultRulePayloads,
  pediatricDrugProfilesFromRules,
  pediatricFluidProfilesFromRules,
  pediatricInfusionProfilesFromRules,
  resolveEffectiveClinicalRules,
  validateClinicalRuleCollectionForPublication,
  validateClinicalRulePayload,
} from "./clinical-rules"
import {
  FLUID_RATE_SLIDER,
  isBloodProductFluid,
  isMaintenanceCompatibleFluid,
  resolveFluidEntryModeProfile,
} from "./intraop-fluids"
import { PEDIATRIC_SOURCE_REFERENCES } from "./pediatric"
import {
  clinicalDraftRuleKeys,
  createLosporAdultV2Draft,
  createLosporPediatricPlatformDraft,
  createLosporPediatricV2Draft,
} from "./platform-clinical-drafts"
import {
  PEDIATRIC_INFUSION_PROFILE_ITEM_COUNT,
  PEDIATRIC_INFUSION_PROFILE_RULE_COUNT,
} from "./pediatric-infusion-profiles"

describe("platform clinical drafts", () => {
  it("covers every catalog drug without treating policy rows as runtime profiles", () => {
    const draft = createLosporPediatricPlatformDraft()
    const policies = draft.rules.filter(rule => rule.payload.kind === "PEDIATRIC_DRUG_POLICY")
    const profiles = draft.rules.filter(rule => rule.payload.kind === "PEDIATRIC_DRUG_PROFILE")
    const fluidProfiles = draft.rules.filter(rule => rule.payload.kind === "PEDIATRIC_FLUID_PROFILE")
    const infusionProfiles = draft.rules.filter(rule => rule.payload.kind === "PEDIATRIC_INFUSION_PROFILE")

    expect(draft.publishable).toBe(true)
    expect(policies).toHaveLength(181)
    expect(new Set(policies.map(rule => rule.payload.kind === "PEDIATRIC_DRUG_POLICY"
      ? rule.payload.medicationKey
      : ""))).toEqual(new Set(DRUG_CATALOG.map(entry => entry.name)))
    expect(profiles).toHaveLength(3)
    expect(profiles.map(rule => rule.payload.kind === "PEDIATRIC_DRUG_PROFILE"
      ? rule.payload.medicationKey
      : "")).toEqual([
      "Ondansetron",
      "Chlorphenamine / Chlorpheniramine",
      "Chlorphenamine / Chlorpheniramine",
    ])
    expect(fluidProfiles).toHaveLength(FLUID_CATALOG.length)
    expect(infusionProfiles).toHaveLength(PEDIATRIC_INFUSION_PROFILE_RULE_COUNT)
    expect(PEDIATRIC_INFUSION_PROFILE_ITEM_COUNT).toBe(INFUSION_CATALOG.length)
    expect(new Set(infusionProfiles.map(rule => rule.payload.kind === "PEDIATRIC_INFUSION_PROFILE"
      ? rule.payload.itemKey
      : ""))).toEqual(new Set(INFUSION_CATALOG.map(entry => entry.name)))

    const effective = clinicalPresetRulesToEffective(
      draft.id,
      "PLATFORM",
      draft.rules.map((rule, index) => ({
        id: `draft-${index}`,
        ruleKey: clinicalRuleKey(rule.payload),
        ruleVersion: `${draft.key}.v${draft.version}`,
        payload: rule.payload,
        sourceRefs: rule.sourceRefs,
      })),
    )
    expect(pediatricDrugProfilesFromRules(effective)).toHaveLength(3)
    expect(pediatricFluidProfilesFromRules(effective)).toHaveLength(FLUID_CATALOG.length)
    expect(pediatricInfusionProfilesFromRules(effective)).toHaveLength(PEDIATRIC_INFUSION_PROFILE_RULE_COUNT)
  })

  it("ships a complete, unique and valid pediatric draft", () => {
    const draft = createLosporPediatricPlatformDraft()
    const keys = clinicalDraftRuleKeys(draft)
    expect(draft.rules).toHaveLength(181 + 3 + FLUID_CATALOG.length + PEDIATRIC_INFUSION_PROFILE_RULE_COUNT)
    expect(new Set(keys).size).toBe(keys.length)
    for (const rule of draft.rules) {
      expect(validateClinicalRulePayload(rule.payload).valid).toBe(true)
    }

    const publication = validateClinicalRuleCollectionForPublication(
      draft.rules.map(rule => ({ ruleKey: clinicalRuleKey(rule.payload), payload: rule.payload })),
    )
    expect(publication).toEqual({ valid: true, issues: [] })
  })

  it("creates a full pediatric v2 drug-profile snapshot without changing v1", () => {
    const v1 = createLosporPediatricPlatformDraft()
    const v2 = createLosporPediatricV2Draft()
    const drugRules = v2.rules.flatMap(rule => (
      rule.payload.kind === "PEDIATRIC_DRUG_PROFILE" ? [rule.payload] : []
    ))

    expect(v1.id).toBe("lospor-pediatrics-v1")
    expect(v1.version).toBe(1)
    expect(v1.rules.filter(rule => rule.payload.kind === "PEDIATRIC_DRUG_POLICY")).toHaveLength(181)
    expect(v2).toMatchObject({
      id: "lospor-pediatrics-v2",
      key: v1.key,
      clinicalMode: "PEDIATRIC",
      version: 2,
      publishable: true,
      blockers: [],
    })
    expect(v2.rules.some(rule => rule.payload.kind === "PEDIATRIC_DRUG_POLICY")).toBe(false)
    expect(v2.rules.some(rule => rule.payload.kind === "PEDIATRIC_DRUG_DOSE")).toBe(false)
    expect(new Set(drugRules.map(rule => rule.medicationKey))).toEqual(
      new Set(DRUG_CATALOG.map(entry => entry.name)),
    )
    expect(drugRules.length).toBeGreaterThanOrEqual(DRUG_CATALOG.length)

    const keys = clinicalDraftRuleKeys(v2)
    expect(new Set(keys).size).toBe(keys.length)
    const publication = validateClinicalRuleCollectionForPublication(
      v2.rules.map(rule => ({ ruleKey: clinicalRuleKey(rule.payload), payload: rule.payload })),
    )
    expect(publication).toEqual({ valid: true, issues: [] })

    const stableKinds = new Set(["PEDIATRIC_INFUSION_PROFILE", "PEDIATRIC_FLUID_PROFILE"])
    const v1Stable = new Map(v1.rules
      .filter(rule => stableKinds.has(rule.payload.kind))
      .map(rule => [clinicalRuleKey(rule.payload), rule]))
    const v2Stable = new Map(v2.rules
      .filter(rule => stableKinds.has(rule.payload.kind))
      .map(rule => [clinicalRuleKey(rule.payload), rule]))
    expect(v2Stable).toEqual(v1Stable)
  })

  it("preserves the approved pediatric v2 status and selector details", () => {
    const draft = createLosporPediatricV2Draft()
    const profiles = draft.rules.flatMap(rule => (
      rule.payload.kind === "PEDIATRIC_DRUG_PROFILE" ? [rule.payload] : []
    ))
    const forDrug = (medicationKey: string) => profiles.filter(
      profile => profile.medicationKey === medicationKey,
    )

    const atropine = forDrug("Atropine")[0]
    expect(atropine).toMatchObject({ availability: "AUTO" })
    expect(atropine?.profile).toMatchObject({
      max: 3,
      step: 0.01,
      quickValues: [0.1, 0.2, 0.3, 0.5, 0.6],
      // IBW is capped at actual weight, so this behaves as TBW normally and
      // McLaren IBW when the actual weight is higher.
      doseCalc: { perKg: 0.01, basis: "IBW", roundTo: 0.01, cap: 0.6, capAtActualWeight: true },
    })
    expect(forDrug("Carbetocin")[0]).toMatchObject({ availability: "MANUAL" })
    expect(forDrug("Carboprost")[0]).toMatchObject({ availability: "MANUAL" })
    expect(forDrug("Vancomycin")[0]).toMatchObject({ availability: "LOCAL", profile: null })
    expect(forDrug("Butorphanol")[0]).toMatchObject({ availability: "HIDDEN", profile: null })

    const lidocaine = forDrug("Lidocaine")[0]
    expect(lidocaine?.availability).toBe("AUTO")
    expect(lidocaine?.profile?.routeModes?.IV).toMatchObject({ unit: "mg" })
    expect(lidocaine?.profile?.routeModes?.INFILTRATION).toMatchObject({
      unit: "mL",
      concentrationUnit: "PERCENT",
      concentrationOptions: ["0.5%", "1%"],
    })
    expect(forDrug("Chlorphenamine / Chlorpheniramine")).toHaveLength(3)
    expect(forDrug("Paracetamol / Acetaminophen")).toHaveLength(2)
  })

  it("emits the complete pediatric fluid selector contract without changing the bag surface", () => {
    const draft = createLosporPediatricPlatformDraft()
    const seeds = draft.rules.flatMap(rule =>
      rule.payload.kind === "PEDIATRIC_FLUID_PROFILE"
        ? [{ ...rule, payload: rule.payload }]
        : [])
    const byItem = new Map(seeds.map(seed => [seed.payload.itemKey, seed]))

    expect(seeds).toHaveLength(FLUID_CATALOG.length)
    expect(new Set(seeds.map(seed => seed.payload.itemKey))).toEqual(
      new Set(FLUID_CATALOG.map(entry => entry.name)),
    )

    for (const entry of FLUID_CATALOG) {
      const seed = byItem.get(entry.name)
      if (!seed || seed.payload.kind !== "PEDIATRIC_FLUID_PROFILE") {
        throw new Error(`Missing pediatric fluid profile for ${entry.name}`)
      }
      const payload = seed.payload
      const catalogProfile = parseDoseProfile(entry.name, "fluid", entry.profile)
      const identity = {
        name: entry.name,
        category: entry.category,
        concentration: catalogProfile.defaultConcentration,
      }
      const bloodProduct = isBloodProductFluid(identity)
      const maintenanceCompatible = isMaintenanceCompatibleFluid(identity)

      expect(payload.labelEn).toBe(entry.name)
      expect(payload.labelBg).toBe(entry.name)
      expect(payload.category).toBe(entry.category)
      expect(payload.minimumAgeDays).toBe(0)
      expect(payload.maximumAgeDaysExclusive).toBe(18 * 365.2425)
      expect(payload.unit).toMatchObject({ amount: "ML", bodyBasis: "NONE", timeBasis: "NONE" })

      // Bag/volume entry remains the canonical catalog surface.
      expect(payload.profile).toMatchObject({
        min: catalogProfile.min,
        max: catalogProfile.max,
        step: catalogProfile.step,
        quickValues: catalogProfile.quickValues,
        routes: catalogProfile.routes,
        defaultRoute: catalogProfile.defaultRoute,
        unit: catalogProfile.unit,
      })
      expect(payload.profile.concentrationOptions).toEqual(catalogProfile.concentrationOptions)
      expect(payload.profile.defaultConcentration).toBe(catalogProfile.defaultConcentration)
      expect(payload.profile.suggestedVolume).toBe(catalogProfile.suggestedVolume)
      expect(payload.profile.doseCalc).toEqual(catalogProfile.doseCalc)

      if (bloodProduct) {
        expect(payload.profile.fluidEntryModes).toEqual(["VOLUME"])
        expect(payload.profile.defaultFluidEntryMode).toBe("VOLUME")
        expect(payload.profile.fluidRate).toBeUndefined()
      } else {
        expect(payload.profile.fluidEntryModes).toEqual(["VOLUME", "RATE"])
        expect(payload.profile.defaultFluidEntryMode).toBe("RATE")
        expect(payload.profile.fluidRate).toEqual({
          ...FLUID_RATE_SLIDER,
          ...(maintenanceCompatible
            ? { calculation: "HOLLIDAY_SEGAR_4_2_1" }
            : {}),
        })
      }
      expect(seed.sourceRefs).toEqual(maintenanceCompatible
        ? [PEDIATRIC_SOURCE_REFERENCES.NICE_NG29.url]
        : [])
    }

    const mannitol = byItem.get("Mannitol")
    if (!mannitol || mannitol.payload.kind !== "PEDIATRIC_FLUID_PROFILE") {
      throw new Error("Missing pediatric Mannitol fluid profile")
    }
    const runtime = resolveFluidEntryModeProfile({
      clinicalMode: "PEDIATRIC",
      name: mannitol.payload.labelEn,
      category: mannitol.payload.category,
      profile: {
        ...mannitol.payload.profile,
        fluidRate: {
          min: 50,
          max: 900,
          step: 25,
          allowManualOutsideRange: false,
          calculation: "HOLLIDAY_SEGAR_4_2_1",
        },
      },
    })
    expect(runtime.defaultFluidEntryMode).toBe("RATE")
    expect(runtime.fluidRate).toEqual(FLUID_RATE_SLIDER)
  })

  it("resolves an institution override of a platform pediatric fluid profile", () => {
    const draft = createLosporPediatricPlatformDraft()
    const presetRules = draft.rules.map((rule, index) => ({
      id: `draft-${index}`,
      ruleKey: clinicalRuleKey(rule.payload),
      ruleVersion: `${draft.key}.v${draft.version}.draft1`,
      payload: rule.payload,
      sourceRefs: rule.sourceRefs,
    }))
    const plasmaLyte = presetRules.find(rule =>
      rule.payload.kind === "PEDIATRIC_FLUID_PROFILE"
      && rule.payload.itemKey === "Plasma-Lyte")
    if (!plasmaLyte || plasmaLyte.payload.kind !== "PEDIATRIC_FLUID_PROFILE") {
      throw new Error("Missing pediatric Plasma-Lyte fluid profile")
    }
    const edited = validateClinicalRulePayload({
      ...plasmaLyte.payload,
      profile: { ...plasmaLyte.payload.profile, suggestedVolume: 321 },
    })
    if (!edited.valid || edited.value.kind !== "PEDIATRIC_FLUID_PROFILE") {
      throw new Error("Invalid pediatric Plasma-Lyte override")
    }

    const effective = resolveEffectiveClinicalRules(draft.id, presetRules, [{
      id: "institution-fluid-override",
      institutionId: "institution-1",
      presetId: draft.id,
      ruleKey: plasmaLyte.ruleKey,
      baseRuleVersion: plasmaLyte.ruleVersion,
      overrideVersion: `${plasmaLyte.ruleVersion}.institution1`,
      payload: edited.value,
      sourceRefs: ["https://hospital.example/fluid-policy"],
      rationale: "Institution bag-size policy",
      status: "APPROVED",
      proposedById: "user-1",
      proposedByName: "Reviewer",
      designatedReviewerId: "reviewer-1",
      designatedReviewerName: "Reviewer",
      designatedReviewedAt: "2026-08-02T10:00:00.000Z",
      hodApproverId: "hod-1",
      hodApproverName: "HOD",
      hodApprovedAt: "2026-08-02T10:05:00.000Z",
      createdAt: "2026-08-02T09:00:00.000Z",
      updatedAt: "2026-08-02T10:05:00.000Z",
    }])
    const profiles = pediatricFluidProfilesFromRules(effective)
    const applicable = applicablePediatricFluidProfiles({
      itemKey: "Plasma-Lyte",
      age: { value: 5, unit: "YEARS" },
      profiles,
    })

    expect(applicable).toHaveLength(1)
    expect(applicable[0]).toMatchObject({
      ruleKey: plasmaLyte.ruleKey,
      ruleVersion: `${plasmaLyte.ruleVersion}.institution1`,
      origin: "INSTITUTION_OVERRIDE",
      presetId: draft.id,
    })
    expect(applicable[0]?.profile.suggestedVolume).toBe(321)
  })

  it("keeps all 40 antimicrobials local-formulary only", () => {
    const draft = createLosporPediatricPlatformDraft()
    const antimicrobialNames = new Set(DRUG_CATALOG
      .filter(entry => entry.category === "Antimicrobials often given intraoperatively")
      .map(entry => entry.name))
    const policies = draft.rules.flatMap(rule =>
      rule.payload.kind === "PEDIATRIC_DRUG_POLICY"
      && antimicrobialNames.has(rule.payload.medicationKey)
        ? [rule]
        : [])
    expect(antimicrobialNames.size).toBe(40)
    expect(policies).toHaveLength(40)
    for (const rule of policies) {
      if (rule.payload.kind !== "PEDIATRIC_DRUG_POLICY") continue
      expect(rule.payload.disposition).toBe("FORMULARY_REQUIRED")
      expect(rule.payload.reviewStatus).toBe("APPROVED")
      expect(rule.sourceRefs.length).toBeGreaterThanOrEqual(4)
    }
  })

  it("creates an additive adult v2 snapshot without mutating adult v1", () => {
    const v1 = createLosporAdultRulePayloads()
    const draft = createLosporAdultV2Draft()
    expect(draft.rules).toHaveLength(251)
    expect(new Set(clinicalDraftRuleKeys(draft)).size).toBe(251)

    const enrichedLocalAnaesthetics = new Set([
      "Lidocaine",
      "Bupivacaine",
      "Levobupivacaine",
      "Ropivacaine",
      "Mepivacaine",
      "Prilocaine",
      "Chloroprocaine",
      "Tetracaine / Amethocaine",
    ])
    const v2ByRuleKey = new Map(draft.rules.map(rule => [clinicalRuleKey(rule.payload), rule]))
    for (const payload of v1) {
      if (payload.kind === "ADULT_DRUG_PROFILE"
        && enrichedLocalAnaesthetics.has(payload.itemKey)) continue
      expect(v2ByRuleKey.get(clinicalRuleKey(payload))?.payload).toEqual(payload)
    }
    expect(draft.rules.filter(rule =>
      rule.payload.kind === "ADULT_DRUG_PROFILE"
      && enrichedLocalAnaesthetics.has(rule.payload.itemKey)
      && rule.sourceRefs.length > 0,
    )).toHaveLength(enrichedLocalAnaesthetics.size)

    const bupivacaine = draft.rules.find(rule =>
      rule.payload.kind === "ADULT_DRUG_PROFILE" && rule.payload.itemKey === "Bupivacaine")
    if (bupivacaine?.payload.kind !== "ADULT_DRUG_PROFILE") {
      throw new Error("Missing adult bupivacaine v2 profile")
    }
    // Baricity is compounded at the bedside, so every neuraxial local anaesthetic
    // offers all three options with isobaric (the unmodified solution) preselected.
    expect(bupivacaine.payload.profile.routeModes?.INTRATHECAL).toMatchObject({
      concentrationOptions: ["0.5%"],
      concentrationUnit: "PERCENT",
      defaultConcentration: "0.5%",
      formulationOptions: ["HYPOBARIC", "ISOBARIC", "HYPERBARIC"],
      defaultFormulation: "ISOBARIC",
    })

    // Intrathecal ropivacaine and mepivacaine are off-label but genuinely used, so
    // the register records them: their quick pills mirror the epidural route (both
    // inherit the catalog concentrations) instead of offering nothing.
    for (const [itemKey, expectedDefault] of [["Ropivacaine", "0.2%"], ["Mepivacaine", "1%"]] as const) {
      const rule = draft.rules.find(candidate =>
        candidate.payload.kind === "ADULT_DRUG_PROFILE"
        && candidate.payload.itemKey === itemKey)
      if (rule?.payload.kind !== "ADULT_DRUG_PROFILE") throw new Error(`Missing ${itemKey}`)
      const intrathecal = rule.payload.profile.routeModes?.INTRATHECAL
      const epidural = rule.payload.profile.routeModes?.EPIDURAL
      expect(intrathecal?.concentrationOptions?.length).toBeGreaterThan(0)
      expect(intrathecal?.concentrationOptions).toEqual(epidural?.concentrationOptions)
      expect(intrathecal?.defaultConcentration).toBe(expectedDefault)
      expect(intrathecal?.formulationOptions).toEqual(["HYPOBARIC", "ISOBARIC", "HYPERBARIC"])
      expect(intrathecal?.defaultFormulation).toBe("ISOBARIC")
    }

    for (const rule of draft.rules) {
      expect(validateClinicalRulePayload(rule.payload).valid).toBe(true)
    }
  })

  it("preserves every tailored adult flat autofill and sublingual route", () => {
    const source = createLosporAdultRulePayloads().flatMap(rule => (
      rule.kind === "ADULT_DRUG_PROFILE" && rule.profile.doseCalc?.flat != null
        ? [rule]
        : []
    ))
    const draft = createLosporAdultV2Draft()
    const draftDrugs = new Map<string, AdultDoseProfileRulePayload>()
    for (const rule of draft.rules) {
      if (rule.payload.kind === "ADULT_DRUG_PROFILE") {
        draftDrugs.set(rule.payload.itemKey, rule.payload)
      }
    }

    expect(source).toHaveLength(113)
    for (const rule of source) {
      expect(draftDrugs.get(rule.itemKey)?.profile.doseCalc?.flat).toBe(rule.profile.doseCalc?.flat)
    }
    expect(draftDrugs.get("Buprenorphine")?.profile.routes).toContain("SL")
    expect(draftDrugs.get("Misoprostol")?.profile.routes).toContain("SL")
  })
})
