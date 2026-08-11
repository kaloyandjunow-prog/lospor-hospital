import { describe, expect, it } from "vitest"
import { createPediatricDrugProfileV2Payloads } from "../pediatric-drug-profiles-v2"
import {
  type PediatricDrugProfileRule,
  type PediatricFluidProfileRule,
  type PediatricInfusionProfileRule,
  pediatricDrugProfilesFromRules,
} from "./pediatric-profiles"
import {
  applyPediatricDrugProfilesToOptions,
  applyPediatricInfusionProfilesToOptions,
  isClinicalRuleConflicted,
} from "./option-overlays"
import {
  applicablePediatricDrugProfiles,
  applicablePediatricFluidProfiles,
  applicablePediatricInfusionProfiles,
  selectApplicablePediatricFluidProfile,
} from "./selection"

/**
 * What must happen when two paediatric bands claim the same child.
 *
 * The bands are authored data, so an overlap is an authoring mistake rather
 * than an impossibility, and it will reach a hospital before it reaches anyone
 * who can spot it. When it does, the only safe answer is no dose at all: the
 * alternative is a number taken from whichever band happened to sort first,
 * which is a real, plausible, in-range dose that no author ever chose for this
 * child — and which differs between the phone and the chart if their rule order
 * differs.
 *
 * The probes are derived from the shipped ruleset rather than written by hand.
 * A band can only start or stop containing a patient at one of its own edges,
 * so probing every edge of every shipped band is exhaustive for the arithmetic
 * and stays exhaustive when the ruleset is re-authored. Core ships no fluid or
 * infusion ruleset yet, so those two families are given rules carrying the
 * shipped drug bands: the band arithmetic under test is the same, and the
 * probes keep tracking the real data.
 */

const days = (value: number) => ({ value, unit: "DAYS" as const })

type Band = {
  minimumAgeDays: number
  maximumAgeDaysExclusive: number
  minimumWeightKg?: number | null
  minimumWeightInclusive?: boolean
  maximumWeightKg?: number | null
  maximumWeightInclusive?: boolean
}

/** Every age at which some band starts or stops containing a patient. */
function ageProbes(bands: readonly Band[]): number[] {
  const probes = new Set<number>()
  for (const band of bands) {
    for (const edge of [band.minimumAgeDays, band.maximumAgeDaysExclusive]) {
      probes.add(Math.max(0, edge - 1))
      probes.add(Math.max(0, edge))
      probes.add(edge + 1)
    }
  }
  return [...probes]
}

/**
 * The same for weight. `null` is always probed because "no weight recorded" is
 * its own case: a band with weight bounds cannot match, one without them can.
 */
function weightProbes(bands: readonly Band[]): (number | null)[] {
  const probes = new Set<number>()
  for (const band of bands) {
    for (const edge of [band.minimumWeightKg, band.maximumWeightKg]) {
      if (edge == null) continue
      probes.add(Math.max(0.1, edge - 0.1))
      probes.add(edge)
      probes.add(edge + 0.1)
    }
  }
  return [null, ...probes]
}

/**
 * A second band over exactly the same patients as the first, carrying values
 * that could not be mistaken for the original's. Anything from this profile
 * that reaches an option's metadata was borrowed from a band nobody selected.
 */
const TWIN_SURFACE = {
  unit: "twin-unit",
  routes: ["TWIN_ROUTE"],
  defaultRoute: "TWIN_ROUTE",
  doseCalc: { perKg: 999, basis: "TBW", roundTo: 1 },
  routeModes: {
    TWIN_ROUTE: {
      min: 0,
      max: 999,
      step: 1,
      unit: "twin-unit",
      quickValues: [999],
      doseCalc: { perKg: 999, basis: "TBW", roundTo: 1 },
    },
  },
}

const shippedDrugProfiles = pediatricDrugProfilesFromRules(
  createPediatricDrugProfileV2Payloads().map((payload, index) => ({
    id: `rule-${index}`,
    ruleKey: `platform.${index}`,
    ruleVersion: "1",
    payload,
    sourceRefs: [],
    origin: "PLATFORM" as const,
    presetId: "lospor-pediatrics-v2",
    overrideId: null,
  })),
)

function groupedByKey<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const item of items) grouped.set(key(item), [...(grouped.get(key(item)) ?? []), item])
  return grouped
}

const shippedByDrug = groupedByKey(shippedDrugProfiles, profile => profile.medicationKey)

/** The catalogue metadata an option carries before any ruleset touches it. */
const catalogueMetadata = { unit: "mg", code: "CAT-1" }

/** Metadata keys an overlay may add once it has refused to choose a band. */
const CONFLICT_KEYS = [
  ...Object.keys(catalogueMetadata),
  "clinicalRuleConflict",
  "manualEntryOnly",
  "doseCalc",
  "doseCalcByRoute",
].sort()

/**
 * The single assertion both overlays have to satisfy on an overlap: an explicit
 * conflict, autofill withdrawn, and not one field taken from any candidate band.
 */
function conflictLeaks(
  where: string,
  option: { label: string; metadata?: unknown },
): string[] {
  const problems: string[] = []
  const meta = (option.metadata ?? {}) as Record<string, unknown>
  if (!isClinicalRuleConflicted(option)) problems.push(`${where}: no conflict reported`)
  if (meta.unit !== catalogueMetadata.unit) problems.push(`${where}: unit became ${String(meta.unit)}`)
  if (meta.doseCalc !== undefined) problems.push(`${where}: kept a dose calculation`)
  if (meta.doseCalcByRoute !== undefined && Object.keys(meta.doseCalcByRoute as object).length) {
    problems.push(`${where}: kept per-route dose calculations`)
  }
  if (meta.manualEntryOnly !== true) problems.push(`${where}: did not fall back to manual entry`)
  const keys = Object.keys(meta).sort()
  if (JSON.stringify(keys) !== JSON.stringify(CONFLICT_KEYS)) {
    problems.push(`${where}: borrowed metadata ${JSON.stringify(keys)}`)
  }
  return problems
}

describe("a drug option claimed by two bands", () => {
  it("borrows no unit, route, dose or availability from either band", () => {
    const leaks: string[] = []
    let overlapsProbed = 0

    for (const [medicationKey, profiles] of shippedByDrug) {
      const twins = profiles.map((profile): PediatricDrugProfileRule => ({
        ...profile,
        ruleKey: `${profile.ruleKey}.twin`,
        availability: "AUTO",
        profile: TWIN_SURFACE as unknown as PediatricDrugProfileRule["profile"],
      }))
      const overlapping = [...profiles, ...twins]
      const option = { label: profiles[0].labelEn, value: medicationKey, metadata: { ...catalogueMetadata } }

      for (const ageDays of ageProbes(overlapping)) {
        for (const weightKg of weightProbes(overlapping)) {
          const applicable = applicablePediatricDrugProfiles({
            medicationKey,
            age: days(ageDays),
            weightKg,
            profiles: overlapping,
          })
          if (applicable.length < 2) continue
          overlapsProbed += 1
          const [result] = applyPediatricDrugProfilesToOptions(
            [option],
            overlapping,
            days(ageDays),
            weightKg,
          )
          leaks.push(...conflictLeaks(
            `${medicationKey} at ${ageDays}d / ${weightKg ?? "no"}kg`,
            result,
          ))
        }
      }
    }

    expect(leaks).toEqual([])
    // The sweep is only meaningful if it actually produced overlaps to judge.
    expect(overlapsProbed).toBeGreaterThan(500)
  })

  it("still overlays the single band when only one applies", () => {
    // The other half of the rule: refusing on an overlap must not turn into
    // refusing whenever more than one band exists for a drug.
    const applied = [...shippedByDrug].filter(([medicationKey, profiles]) => {
      const option = { label: profiles[0].labelEn, value: medicationKey, metadata: { ...catalogueMetadata } }
      const [result] = applyPediatricDrugProfilesToOptions(
        [option],
        profiles,
        days(profiles[0].minimumAgeDays),
        20,
      )
      const meta = result.metadata as Record<string, unknown>
      return meta.clinicalRuleAvailability !== undefined && !isClinicalRuleConflicted(result)
    })
    expect(applied.length).toBeGreaterThan(100)
  })
})

/**
 * Fluid and infusion rules carrying the shipped drug bands, so the probes below
 * are derived from real authored boundaries rather than invented ones.
 */
const bandSources = [...shippedByDrug.values()].flat()

const fluidProfiles: PediatricFluidProfileRule[] = bandSources.map((profile, index) => ({
  ruleKey: `fluid.${index}`,
  ruleVersion: "1",
  itemKey: `FLUID_${profile.medicationKey}`,
  labelEn: `Fluid ${profile.labelEn}`,
  labelBg: null,
  category: null,
  minimumAgeDays: profile.minimumAgeDays,
  maximumAgeDaysExclusive: profile.maximumAgeDaysExclusive,
  profile: { unit: "ml", routes: ["IV"] } as PediatricFluidProfileRule["profile"],
  unit: null,
  routeUnits: {},
  sourceIds: [],
  origin: "PLATFORM",
  presetId: "lospor-pediatrics-v2",
}))

const infusionProfiles: PediatricInfusionProfileRule[] = bandSources.map((profile, index) => ({
  ruleKey: `infusion.${index}`,
  ruleVersion: "1",
  itemKey: `INFUSION_${profile.medicationKey}`,
  labelEn: `Infusion ${profile.labelEn}`,
  labelBg: null,
  category: null,
  disposition: "AUTO",
  routeDispositions: {},
  manualEntryOnly: false,
  routeManualEntryOnly: {},
  minimumAgeDays: profile.minimumAgeDays,
  maximumAgeDaysExclusive: profile.maximumAgeDaysExclusive,
  minimumWeightKg: profile.minimumWeightKg ?? null,
  minimumWeightInclusive: profile.minimumWeightInclusive ?? true,
  maximumWeightKg: profile.maximumWeightKg ?? null,
  maximumWeightInclusive: profile.maximumWeightInclusive ?? false,
  routineSuggestion: true,
  advisory: null,
  profile: { unit: "mcg/kg/min", routes: ["IV"] } as PediatricInfusionProfileRule["profile"],
  unit: null,
  routeUnits: {},
  manualUnit: null,
  sourceIds: [],
  origin: "PLATFORM",
  presetId: "lospor-pediatrics-v2",
}))

describe("a fluid claimed by two bands", () => {
  it("yields no profile and an explicit conflict at every band edge", () => {
    const problems: string[] = []
    let overlapsProbed = 0

    for (const [itemKey, profiles] of groupedByKey(fluidProfiles, item => item.itemKey)) {
      const overlapping = [
        ...profiles,
        ...profiles.map(profile => ({ ...profile, ruleKey: `${profile.ruleKey}.twin` })),
      ]
      for (const ageDays of ageProbes(overlapping)) {
        const applicable = applicablePediatricFluidProfiles({
          itemKey,
          age: days(ageDays),
          profiles: overlapping,
        })
        const selection = selectApplicablePediatricFluidProfile({
          itemKey,
          age: days(ageDays),
          profiles: overlapping,
        })
        const where = `${itemKey} at ${ageDays}d`
        if (applicable.length > 1) {
          overlapsProbed += 1
          if (selection.profile !== null) problems.push(`${where}: chose a band from ${applicable.length}`)
          if (!selection.conflict) problems.push(`${where}: no conflict reported`)
        } else if (selection.conflict) {
          problems.push(`${where}: conflict reported for ${applicable.length} bands`)
        } else if (selection.profile !== (applicable[0] ?? null)) {
          problems.push(`${where}: did not return the single applicable band`)
        }
        if (selection.applicableCount !== applicable.length) {
          problems.push(`${where}: counted ${selection.applicableCount} of ${applicable.length}`)
        }
      }
    }

    expect(problems).toEqual([])
    expect(overlapsProbed).toBeGreaterThan(100)
  })
})

describe("an infusion option claimed by two bands", () => {
  it("borrows no unit, route, dose or disposition from either band", () => {
    const leaks: string[] = []
    let overlapsProbed = 0

    for (const [itemKey, profiles] of groupedByKey(infusionProfiles, item => item.itemKey)) {
      const overlapping = [
        ...profiles,
        ...profiles.map((profile): PediatricInfusionProfileRule => ({
          ...profile,
          ruleKey: `${profile.ruleKey}.twin`,
          profile: TWIN_SURFACE as unknown as PediatricInfusionProfileRule["profile"],
        })),
      ]
      const option = { label: profiles[0].labelEn, value: itemKey, metadata: { ...catalogueMetadata } }

      for (const ageDays of ageProbes(overlapping)) {
        for (const weightKg of weightProbes(overlapping)) {
          const applicable = applicablePediatricInfusionProfiles({
            itemKey,
            age: days(ageDays),
            weightKg,
            profiles: overlapping,
          })
          if (applicable.length < 2) continue
          overlapsProbed += 1
          const [result] = applyPediatricInfusionProfilesToOptions(
            [option],
            overlapping,
            days(ageDays),
            weightKg,
          )
          leaks.push(...conflictLeaks(
            `${itemKey} at ${ageDays}d / ${weightKg ?? "no"}kg`,
            result,
          ))
        }
      }
    }

    expect(leaks).toEqual([])
    expect(overlapsProbed).toBeGreaterThan(500)
  })
})
