import {
  type PediatricAgeInput,
} from "../pediatric"
import {
  type AdultDoseProfileRule,
} from "./adult-profiles"
import {
  type PediatricDrugProfileRule,
  type PediatricInfusionProfileRule,
} from "./pediatric-profiles"
import {
  applicablePediatricDrugProfiles,
  applicablePediatricInfusionProfiles,
} from "./selection"
import {
  type AdultDoseProfileRuleKind,
} from "./types"

/**
 * Overlay the adult ruleset onto an option list.
 *
 * Hidden options are marked, never removed — the same rule the pediatric
 * overlays below follow. This matters because these lists are the lookup source
 * for units, routes, concentrations and colours, not just the picker: dropping
 * an entry here would leave a drug already recorded on a case unresolvable, and
 * would take it out of search, so a clinician could not document something they
 * had actually given. Pickers call `visibleClinicalOptions` to trim the view.
 */
export function applyAdultDoseProfilesToOptions<
  T extends { label: string; value?: string; metadata?: unknown },
>(
  options: readonly T[],
  rules: readonly AdultDoseProfileRule[],
  kind: AdultDoseProfileRuleKind,
): T[] {
  const profiles = new Map(
    rules
      .filter(rule => rule.kind === kind)
      .flatMap(rule => {
        const keys = [rule.itemKey, rule.labelEn]
          .map(value => value.trim().toUpperCase())
          .filter(Boolean)
        return keys.map(key => [key, rule] as const)
      }),
  )
  return options.map(option => {
    const rule = profiles.get(option.label.trim().toUpperCase())
      ?? (option.value ? profiles.get(option.value.trim().toUpperCase()) : undefined)
    if (!rule) return option
    const profile = rule.profile
    const metadata = option.metadata && typeof option.metadata === "object" && !Array.isArray(option.metadata)
      ? option.metadata as Record<string, unknown>
      : {}
    return {
      ...option,
      metadata: {
        ...metadata,
        ...profile,
        clinicalRuleAvailability: rule.availability,
        clinicalRuleHidden: rule.availability === "HIDDEN",
        manualEntryOnly: rule.availability === "LOCAL",
        ...(rule.availability === "MANUAL" || rule.availability === "LOCAL"
          ? { doseCalc: undefined, doseCalcByRoute: {} }
          : {}),
      },
    }
  })
}

type OptionLike = { label: string; value?: string; metadata?: unknown }

function optionMetadata(option: OptionLike): Record<string, unknown> {
  return option.metadata && typeof option.metadata === "object" && !Array.isArray(option.metadata)
    ? option.metadata as Record<string, unknown>
    : {}
}

function optionKeys(option: OptionLike): string[] {
  return [option.label, option.value]
    .filter((value): value is string => !!value)
    .map(value => value.trim().toUpperCase())
}

/**
 * Pediatric counterpart to `applyAdultDoseProfilesToOptions`.
 *
 * Without this, pediatric availability only took effect once a drug sheet was
 * already open, so a band marked HIDDEN still appeared in the picker and a
 * MANUAL band still advertised autofill in the list. Selecting the band needs
 * the patient, so age (and weight) are required here.
 */
export function applyPediatricDrugProfilesToOptions<T extends OptionLike>(
  options: readonly T[],
  profiles: readonly PediatricDrugProfileRule[],
  age: PediatricAgeInput | null,
  weightKg?: number | null,
): T[] {
  if (!age || !profiles.length) return [...options]
  const result: T[] = []
  for (const option of options) {
    const [rule] = optionKeys(option).flatMap(key => applicablePediatricDrugProfiles({
      medicationKey: key,
      age,
      weightKg,
      profiles,
    }))
    if (!rule) {
      result.push(option)
      continue
    }
    const availability = rule.availability ?? "AUTO"
    const manualOnly = availability === "MANUAL" || availability === "LOCAL"
    result.push({
      ...option,
      metadata: {
        ...optionMetadata(option),
        ...(rule.profile ?? {}),
        clinicalRuleAvailability: availability,
        // Marked, never dropped: the option must stay in the lookup maps so an
        // already-recorded drug keeps its units, codes and colour. Pickers call
        // `visibleClinicalOptions`; search deliberately still finds it.
        clinicalRuleHidden: availability === "HIDDEN",
        manualEntryOnly: availability === "LOCAL",
        ...(manualOnly ? { doseCalc: undefined, doseCalcByRoute: {} } : {}),
      },
    })
  }
  return result
}

/**
 * Same idea for continuous infusions, which express availability as a
 * `disposition` rather than an `availability`.
 */
export function applyPediatricInfusionProfilesToOptions<T extends OptionLike>(
  options: readonly T[],
  profiles: readonly PediatricInfusionProfileRule[],
  age: PediatricAgeInput | null,
  weightKg?: number | null,
): T[] {
  if (!age || !profiles.length) return [...options]
  const result: T[] = []
  for (const option of options) {
    const [rule] = optionKeys(option).flatMap(key => applicablePediatricInfusionProfiles({
      itemKey: key,
      age,
      weightKg,
      profiles,
    }))
    if (!rule) {
      result.push(option)
      continue
    }
    const disposition = rule.disposition ?? "AUTO"
    const manualOnly = disposition === "MANUAL" || disposition === "LOCAL" || rule.manualEntryOnly
    result.push({
      ...option,
      metadata: {
        ...optionMetadata(option),
        ...(rule.profile ?? {}),
        clinicalRuleAvailability: disposition,
        clinicalRuleHidden: disposition === "HIDDEN",
        manualEntryOnly: disposition === "LOCAL" || !!rule.manualEntryOnly,
        ...(manualOnly ? { doseCalc: undefined, doseCalcByRoute: {} } : {}),
      },
    })
  }
  return result
}

/** True when a ruleset hides this option from the default picker. */
export function isClinicalRuleHidden(option: OptionLike): boolean {
  return optionMetadata(option).clinicalRuleHidden === true
}

/**
 * The options a picker should offer by default.
 *
 * Hidden items are deliberately kept in the full option list — they must stay
 * resolvable for drugs already recorded on a case, and must remain findable by
 * search so a clinician is never blocked from documenting what they gave.
 * Only the default picker view is trimmed.
 */
export function visibleClinicalOptions<T extends OptionLike>(options: readonly T[]): T[] {
  return options.filter(option => !isClinicalRuleHidden(option))
}
