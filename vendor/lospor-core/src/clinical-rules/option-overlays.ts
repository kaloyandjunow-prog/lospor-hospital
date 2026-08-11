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
  type PediatricProfileSelection,
  selectApplicablePediatricDrugProfile,
  selectApplicablePediatricInfusionProfile,
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
  return [...new Set(
    [option.label, option.value]
      .filter((value): value is string => !!value)
      .map(value => value.trim().toUpperCase()),
  )]
}

/**
 * The one profile that governs an option, or an explicit conflict.
 *
 * An option is looked up by two keys — its label and its value — and each key
 * can be claimed by a band, so "which profile applies" is decided across both.
 * `selectApplicablePediatric*Profile` already answers that per key: exactly one
 * match is used, several is a conflict. This adds the only part they cannot
 * see, which is that two different keys may each resolve, to two different
 * bands, for the same option.
 *
 * The same rule reached through both keys is not a conflict — a rule whose
 * `medicationKey` matches the option's value and whose `labelEn` matches its
 * label is one band, found twice — so candidates are deduplicated by ruleKey.
 *
 * How many bands collided is deliberately not reported. Each key answers for
 * itself, and the same collision seen through two keys would be counted twice;
 * a number that is sometimes double is worse to put in front of a clinician
 * than no number, and nothing needs it to say the ruleset is ambiguous here.
 */
function selectProfileForOption<T extends { ruleKey: string }>(
  option: OptionLike,
  select: (key: string) => PediatricProfileSelection<T>,
): { profile: T | null; conflict: boolean } {
  const candidates = new Map<string, T>()
  let conflict = false
  for (const key of optionKeys(option)) {
    const selection = select(key)
    if (selection.conflict) conflict = true
    if (selection.profile) candidates.set(selection.profile.ruleKey, selection.profile)
  }
  if (conflict || candidates.size > 1) return { profile: null, conflict: true }
  const [profile] = candidates.values()
  return { profile: profile ?? null, conflict: false }
}

/**
 * What an option looks like when the ruleset cannot say which band applies.
 *
 * No part of any candidate band is merged: not its unit, not its routes, not
 * its dose calculation, not its availability. Taking the first band's metadata
 * would put a real number on the screen that no author ever chose for this
 * child, and the two apps would disagree about which number depending on rule
 * order. The option keeps its catalogue identity so an already-recorded drug
 * still renders, autofill is withdrawn, and the conflict is stated so a client
 * can say why the dose box is empty rather than leaving it silently blank.
 */
function conflictedOption<T extends OptionLike>(option: T): T {
  return {
    ...option,
    metadata: {
      ...optionMetadata(option),
      clinicalRuleConflict: true,
      manualEntryOnly: true,
      doseCalc: undefined,
      doseCalcByRoute: {},
    },
  }
}

/**
 * Pediatric counterpart to `applyAdultDoseProfilesToOptions`.
 *
 * Without this, pediatric availability only took effect once a drug sheet was
 * already open, so a band marked HIDDEN still appeared in the picker and a
 * MANUAL band still advertised autofill in the list. Selecting the band needs
 * the patient, so age (and weight) are required here.
 *
 * Which band applies is `selectApplicablePediatricDrugProfile`'s decision, not
 * this function's: exactly one, or none and a conflict. See `conflictedOption`
 * for what an option looks like when the bands disagree.
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
    const selection = selectProfileForOption(option, key => selectApplicablePediatricDrugProfile({
      medicationKey: key,
      age,
      weightKg,
      profiles,
    }))
    if (selection.conflict) {
      result.push(conflictedOption(option))
      continue
    }
    const rule = selection.profile
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
    const selection = selectProfileForOption(option, key => selectApplicablePediatricInfusionProfile({
      itemKey: key,
      age,
      weightKg,
      profiles,
    }))
    if (selection.conflict) {
      result.push(conflictedOption(option))
      continue
    }
    const rule = selection.profile
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

/**
 * True when several pediatric bands claimed this option and none may be used.
 *
 * The option is still offered — the drug exists and may well have been given —
 * but nothing about the dose is suggested. A client showing this should say the
 * ruleset is ambiguous for this patient rather than leaving an empty box.
 */
export function isClinicalRuleConflicted(option: OptionLike): boolean {
  return optionMetadata(option).clinicalRuleConflict === true
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
