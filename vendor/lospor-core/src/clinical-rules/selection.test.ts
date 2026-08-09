import { describe, expect, it } from "vitest"
import {
  applicablePediatricDrugProfiles,
  applicablePediatricFluidProfiles,
  applicablePediatricInfusionProfiles,
} from "./selection"
import { applicablePediatricDoseProfiles } from "./effective"
import type {
  PediatricDrugProfileRule,
  PediatricFluidProfileRule,
  PediatricInfusionProfileRule,
} from "./pediatric-profiles"
import type { PediatricDoseProfile } from "../pediatric-dose"

/**
 * Age and weight bands decide which dose a child is offered, so the seam
 * between two adjacent bands is the highest-consequence arithmetic in the
 * package: a child on the boundary must belong to exactly one band, never to
 * both and never to neither.
 *
 * Bands are half-open — `[minimumAgeDays, maximumAgeDaysExclusive)`. These
 * cases exist so that "correcting" the comparison to `<=` fails loudly here
 * instead of silently letting the sort order pick the dose.
 *
 * Ages are given in DAYS throughout: months and years are converted with an
 * average year of 365.2425 days, which would make boundary assertions
 * approximate rather than exact.
 */

const days = (value: number) => ({ value, unit: "DAYS" as const })

const drug = (
  over: Partial<PediatricDrugProfileRule> = {},
): PediatricDrugProfileRule => ({
  ruleKey: "ped.paracetamol",
  ruleVersion: "LOSPOR_PEDIATRICS.v2",
  medicationKey: "PARACETAMOL",
  labelEn: "Paracetamol",
  labelBg: null,
  inn: null,
  category: null,
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 28,
  profile: null,
  unit: null,
  routeUnits: {},
  sourceIds: [],
  origin: "PLATFORM",
  presetId: "lospor-pediatrics-v2",
  ...over,
})

const fluid = (over: Partial<PediatricFluidProfileRule> = {}): PediatricFluidProfileRule => ({
  ruleKey: "ped.fluid.saline",
  ruleVersion: "LOSPOR_PEDIATRICS.v2",
  itemKey: "SALINE_0_9",
  labelEn: "Sodium chloride 0.9%",
  labelBg: null,
  category: null,
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 28,
  sourceIds: [],
  origin: "PLATFORM",
  presetId: "lospor-pediatrics-v2",
  ...over,
} as PediatricFluidProfileRule)

const infusion = (
  over: Partial<PediatricInfusionProfileRule> = {},
): PediatricInfusionProfileRule => ({
  ruleKey: "ped.inf.dopamine",
  ruleVersion: "LOSPOR_PEDIATRICS.v2",
  itemKey: "DOPAMINE",
  labelEn: "Dopamine",
  labelBg: null,
  category: null,
  disposition: "AUTO",
  routeDispositions: {},
  manualEntryOnly: false,
  routeManualEntryOnly: {},
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 28,
  minimumWeightKg: null,
  minimumWeightInclusive: true,
  maximumWeightKg: null,
  maximumWeightInclusive: false,
  routineSuggestion: false,
  advisory: null,
  profile: null,
  unit: null,
  routeUnits: {},
  manualUnit: null,
  sourceIds: [],
  origin: "PLATFORM",
  presetId: "lospor-pediatrics-v2",
  ...over,
})

const dose = (over: Partial<PediatricDoseProfile> = {}): PediatricDoseProfile => ({
  key: "ped.dose.paracetamol.neonate",
  medicationKey: "PARACETAMOL",
  indication: "Analgesia",
  route: "IV",
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 28,
  basis: "PER_KG" as PediatricDoseProfile["basis"],
  amountPerUnit: 10,
  doseUnit: "mg",
  sourceIds: [],
  version: "v2",
  reviewStatus: "APPROVED",
  ...over,
})

// Two touching bands: neonate [0, 28) and infant [28, 365).
const NEONATE = { minimumAgeDays: 0, maximumAgeDaysExclusive: 28 }
const INFANT = { minimumAgeDays: 28, maximumAgeDaysExclusive: 365 }

describe("age bands are half-open intervals", () => {
  const profiles = [
    drug({ ruleKey: "neonate", ...NEONATE }),
    drug({ ruleKey: "infant", ...INFANT }),
  ]
  const match = (ageDays: number) =>
    applicablePediatricDrugProfiles({
      medicationKey: "PARACETAMOL",
      age: days(ageDays),
      profiles,
    }).map(p => p.ruleKey)

  it("includes a child of exactly the band minimum", () => {
    expect(match(0)).toEqual(["neonate"])
    expect(match(28)).toEqual(["infant"])
  })

  it("excludes a child of exactly the band maximum, handing them to the next band", () => {
    // A 28-day-old is an infant, not a neonate. If this ever returns both, the
    // sort order silently decides which dose is offered.
    expect(match(28)).not.toContain("neonate")
  })

  it("gives every age in the covered range exactly one band", () => {
    for (let age = 0; age < 365; age += 1) {
      expect(match(age)).toHaveLength(1)
    }
  })

  it("matches nothing beyond the last band", () => {
    expect(match(365)).toEqual([])
    expect(match(4000)).toEqual([])
  })

  it("applies the same rule to fluids and infusions", () => {
    const fluids = [fluid({ ruleKey: "neonate", ...NEONATE }), fluid({ ruleKey: "infant", ...INFANT })]
    const infusions = [
      infusion({ ruleKey: "neonate", ...NEONATE }),
      infusion({ ruleKey: "infant", ...INFANT }),
    ]
    expect(
      applicablePediatricFluidProfiles({ itemKey: "SALINE_0_9", age: days(28), profiles: fluids })
        .map(p => p.ruleKey),
    ).toEqual(["infant"])
    expect(
      applicablePediatricInfusionProfiles({ itemKey: "DOPAMINE", age: days(28), profiles: infusions })
        .map(p => p.ruleKey),
    ).toEqual(["infant"])
  })

  it("returns nothing when the patient has no recorded age", () => {
    expect(applicablePediatricDrugProfiles({ medicationKey: "PARACETAMOL", age: null, profiles }))
      .toEqual([])
  })
})

describe("weight bands", () => {
  const profiles = [drug({ ruleKey: "small", minimumWeightKg: 3, maximumWeightKg: 10 })]
  const match = (weightKg: number | null) =>
    applicablePediatricDrugProfiles({
      medicationKey: "PARACETAMOL",
      age: days(10),
      weightKg,
      profiles,
    }).map(p => p.ruleKey)

  it("includes the minimum weight by default but excludes the maximum", () => {
    // Mirrors the age convention: lower bound closed, upper bound open, so two
    // adjacent weight bands cannot both claim the same child.
    expect(match(3)).toEqual(["small"])
    expect(match(10)).toEqual([])
    expect(match(9.9)).toEqual(["small"])
  })

  it("excludes a child whose weight has not been recorded", () => {
    // Refusing to match is the safe direction: a weight-banded dose must not be
    // offered on the strength of an assumed weight.
    expect(match(null)).toEqual([])
    expect(match(0)).toEqual([])
  })

  it("ignores weight entirely when the rule declares no weight band", () => {
    const unbanded = [drug({ ruleKey: "any" })]
    expect(
      applicablePediatricDrugProfiles({
        medicationKey: "PARACETAMOL",
        age: days(10),
        weightKg: null,
        profiles: unbanded,
      }).map(p => p.ruleKey),
    ).toEqual(["any"])
  })
})

describe("applicablePediatricDoseProfiles", () => {
  it("offers only APPROVED profiles", () => {
    // An unreviewed or rejected dose must never reach a patient, whatever its
    // age band says.
    const profiles = [
      dose({ key: "approved" }),
      dose({ key: "draft", reviewStatus: "DRAFT" as PediatricDoseProfile["reviewStatus"] }),
    ]
    expect(
      applicablePediatricDoseProfiles({ medicationKey: "PARACETAMOL", age: days(10), profiles })
        .map(p => p.key),
    ).toEqual(["approved"])
  })

  it("bands on the same half-open interval as the rule matchers", () => {
    const profiles = [
      dose({ key: "neonate", ...NEONATE }),
      dose({ key: "infant", ...INFANT }),
    ]
    const match = (ageDays: number) =>
      applicablePediatricDoseProfiles({ medicationKey: "PARACETAMOL", age: days(ageDays), profiles })
        .map(p => p.key)
    expect(match(27)).toEqual(["neonate"])
    expect(match(28)).toEqual(["infant"])
  })

  it("does not match a different medication", () => {
    expect(
      applicablePediatricDoseProfiles({
        medicationKey: "MORPHINE",
        age: days(10),
        profiles: [dose()],
      }),
    ).toEqual([])
  })

  it("returns nothing without an age", () => {
    expect(
      applicablePediatricDoseProfiles({ medicationKey: "PARACETAMOL", age: null, profiles: [dose()] }),
    ).toEqual([])
  })

  it("sorts by indication then route so the order shown is stable", () => {
    const profiles = [
      dose({ key: "b", indication: "Fever", route: "PO" }),
      dose({ key: "a", indication: "Analgesia", route: "IV" }),
      dose({ key: "c", indication: "Fever", route: "IV" }),
    ]
    expect(
      applicablePediatricDoseProfiles({ medicationKey: "PARACETAMOL", age: days(10), profiles })
        .map(p => p.key),
    ).toEqual(["a", "c", "b"])
  })
})
