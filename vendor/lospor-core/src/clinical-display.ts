/**
 * The clinical display helpers, taking any locale string.
 *
 * Everything here delegates to ./display. What it adds is one narrowing --
 * "bg-BG", "BG", "bg" all mean Bulgarian -- so callers can pass whatever
 * their locale store holds instead of narrowing at every call site.
 *
 * Both apps had their own copy of this file: the same nine one-line wrappers,
 * plus three helpers only one of them had. Nothing in it was ever
 * platform-specific.
 */
import {
  clinicalDisplayLabel,
  formatClinicalGasMixLabel,
  formatClinicalGasSettingsLabel,
  optionDisplayEntry as coreOptionDisplayEntry,
  optionDisplayPath,
  resolveClinicalDisplay,
  resolveOptionDisplay,
  type ClinicalDisplayDomain,
  type ClinicalLocale,
  type DynamicClinicalLabels,
  type ResolvedClinicalDisplay,
} from "./display"
import { ALL_COMPLICATIONS, canonicalComplicationLabel } from "./complications"
import type { LibraryCategory } from "./option-contracts"
import type { GasDisplaySettings } from "./intraop-summary"
import type { LibraryOption } from "./option-library"
export function toClinicalLocale(locale: string | null | undefined): ClinicalLocale {
  return locale?.toLocaleLowerCase("en").startsWith("bg") ? "bg" : "en"
}

export function displayOption(
  category: LibraryCategory,
  option: Pick<LibraryOption, "value" | "label" | "labelBg" | "description">,
  locale: string | ClinicalLocale,
): string {
  return resolveOptionDisplay(category, option, toClinicalLocale(locale)).label
}

export function displayNamedOption(
  category: LibraryCategory,
  options: readonly LibraryOption[],
  valueOrLabel: string,
  locale: string | ClinicalLocale,
): string {
  const option = options.find(candidate =>
    candidate.value === valueOrLabel || candidate.label === valueOrLabel,
  )
  return option
    ? displayOption(category, option, locale)
    : displayClinicalCode(`option:${category}`, valueOrLabel, locale, {
        label: valueOrLabel,
      })
}

export function displayOptionPath(
  category: LibraryCategory,
  value: string,
  locale: string | ClinicalLocale,
): string {
  return optionDisplayPath(category, value, toClinicalLocale(locale))
}

export function displayOptionEntry(
  category: LibraryCategory,
  entry: string,
  locale: string | ClinicalLocale,
): string {
  return coreOptionDisplayEntry(category, entry, toClinicalLocale(locale))
}

export function localizedOptions(
  category: LibraryCategory,
  options: readonly LibraryOption[],
  locale: string | ClinicalLocale,
): LibraryOption[] {
  return options.map(option => {
    const display = resolveOptionDisplay(category, option, toClinicalLocale(locale))
    return {
      ...option,
      label: display.label,
      description: display.description ?? option.description,
    }
  })
}

export function resolveDisplayOption(
  category: LibraryCategory,
  option: Pick<LibraryOption, "value" | "label" | "labelBg" | "description">,
  locale: string | ClinicalLocale,
): ResolvedClinicalDisplay {
  return resolveOptionDisplay(category, option, toClinicalLocale(locale))
}

export function displayClinicalCode(
  domain: ClinicalDisplayDomain,
  code: string | null | undefined,
  locale: string | ClinicalLocale,
  dynamic?: DynamicClinicalLabels,
): string {
  return clinicalDisplayLabel(domain, code, toClinicalLocale(locale), dynamic)
}

export function resolveDisplayCode(
  domain: ClinicalDisplayDomain,
  code: string | null | undefined,
  locale: string | ClinicalLocale,
  dynamic?: DynamicClinicalLabels,
): ResolvedClinicalDisplay {
  return resolveClinicalDisplay(domain, code, toClinicalLocale(locale), dynamic)
}

/**
 * Which display domain a summary-timetable lane's codes resolve against.
 *
 * Exported so a renderer that never builds a `SummaryTimetableModel` --
 * PrintTimetable draws its own SVG straight off the raw timetable shape --
 * still resolves an agent/infusion/fluid/position code exactly the way the
 * model-based summary does, from the one place this mapping is written.
 */
/** The kinds of lane the record's timetable draws. */
export type SummaryLaneKind = "agent" | "infusion" | "gas" | "fluid" | "position"

export function summaryLaneDomain(kind: SummaryLaneKind): ClinicalDisplayDomain | null {
  if (kind === "agent") return "option:INHALATIONAL_AGENT"
  if (kind === "infusion") return "option:INTRAOP_INFUSION"
  if (kind === "fluid") return "option:INTRAOP_FLUID"
  if (kind === "position") return "option:POSITION"
  return null
}

/** A complication by the complications catalogue's name, in the reader's language (10.1.0). */
export function complicationDisplayLabel(label: string, locale: ClinicalLocale | string): string {
  const canonical = canonicalComplicationLabel(label)
  return clinicalDisplayLabel("complication", canonical, locale === "bg" ? "bg" : "en", { label: canonical })
}

/**
 * A clinical event's display label: a known option code resolves through the
 * option domain; anything else (free text, an older unmapped code) falls back
 * to the complication-label formatter so it still reads as a label rather
 * than a raw code. Shared so PrintTimetable's own SVG-drawn event flags agree
 * with the lane names the record's timetable model uses.
 */
export function resolveIntraopEventLabel(label: string, locale: ClinicalLocale): string {
  // A complication reads as the complications catalogue names it, whichever
  // button charted it: one name in the picker, the list, the log and print.
  if (ALL_COMPLICATIONS.includes(canonicalComplicationLabel(label))) return complicationDisplayLabel(label, locale)
  const option = resolveClinicalDisplay("option:INTRAOP_EVENT", label, locale)
  return option.known
    ? option.label
    : clinicalDisplayLabel("complication", label, locale, { label })
}

export function displayGasMix(
  settings: GasDisplaySettings,
  locale: string | ClinicalLocale,
): string {
  return formatClinicalGasMixLabel(settings, toClinicalLocale(locale))
}

export function displayGasSettings(
  settings: GasDisplaySettings,
  locale: string | ClinicalLocale,
): string {
  return formatClinicalGasSettingsLabel(settings, toClinicalLocale(locale))
}
