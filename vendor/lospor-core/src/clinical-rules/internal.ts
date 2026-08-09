/**
 * Shared internals for the clinical-rules modules.
 *
 * These are private to this directory: the barrel deliberately does NOT
 * re-export them, so `export *` from the public modules cannot widen the
 * package's public surface by accident. Anything here is an implementation
 * detail that two or more sibling modules happen to need.
 */

/**
 * An age band, held as a half-open interval: `[minimumAgeDays,
 * maximumAgeDaysExclusive)`. Half-open is what guarantees adjacent bands
 * partition the age range instead of overlapping at the seam — a child of
 * exactly `maximumAgeDaysExclusive` belongs to the *next* band, not to two at
 * once. Never widen this to an inclusive upper bound.
 */
export type PediatricRuleAgeBand = {
  minimumAgeDays: number
  maximumAgeDaysExclusive: number
}

export type PediatricRuleWeightBand = {
  minimumWeightKg?: number | null
  minimumWeightInclusive?: boolean
  maximumWeightKg?: number | null
  maximumWeightInclusive?: boolean
}

/**
 * Structurally typed rather than importing `EffectiveClinicalRule`, so this
 * module stays free of any dependency on `./types` and the directory has no
 * import cycle at all.
 */
export function effectiveRuleSourceIds(
  rule: { presetId: string; id: string; sourceRefs: readonly string[] },
): string[] {
  return [...new Set([
    `preset:${rule.presetId}`,
    `rule:${rule.id}`,
    ...rule.sourceRefs,
  ])]
}

export function pediatricWeightMatches(
  profile: PediatricRuleWeightBand,
  weightKg: number | null | undefined,
): boolean {
  if (profile.minimumWeightKg == null && profile.maximumWeightKg == null) return true
  if (weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0) return false
  const aboveMinimum = profile.minimumWeightKg == null
    || weightKg > profile.minimumWeightKg
    || ((profile.minimumWeightInclusive ?? true) && weightKg === profile.minimumWeightKg)
  const belowMaximum = profile.maximumWeightKg == null
    || weightKg < profile.maximumWeightKg
    || ((profile.maximumWeightInclusive ?? false) && weightKg === profile.maximumWeightKg)
  return aboveMinimum && belowMaximum
}
