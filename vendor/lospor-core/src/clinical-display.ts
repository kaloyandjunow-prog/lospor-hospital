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
import type { LibraryCategory } from "./option-contracts"
import type { GasDisplaySettings } from "./intraop-summary"
import type { LibraryOption } from "./option-library"
import type { SummaryLaneKind, SummaryTimetableModel } from "./summary-timetable"
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
export function summaryLaneDomain(kind: SummaryLaneKind): ClinicalDisplayDomain | null {
  if (kind === "agent") return "option:INHALATIONAL_AGENT"
  if (kind === "infusion") return "option:INTRAOP_INFUSION"
  if (kind === "fluid") return "option:INTRAOP_FLUID"
  if (kind === "position") return "option:POSITION"
  return null
}
const summarySegmentDomain = summaryLaneDomain

/**
 * A clinical event's display label: a known option code resolves through the
 * option domain; anything else (free text, an older unmapped code) falls back
 * to the complication-label formatter so it still reads as a label rather
 * than a raw code. Shared so PrintTimetable's own SVG-drawn event flags agree
 * with what `localizeSummaryTimetableModel` puts on the model-based summary.
 */
export function resolveIntraopEventLabel(label: string, locale: ClinicalLocale): string {
  const option = resolveClinicalDisplay("option:INTRAOP_EVENT", label, locale)
  return option.known
    ? option.label
    : clinicalDisplayLabel("complication", label, locale, { label })
}

function localizeSummaryGasText(
  text: string,
  code: string,
  locale: ClinicalLocale,
): string {
  const carrierCode = code.toLocaleLowerCase("en")
  const sourcePrefix = carrierCode === "air"
    ? "O₂/Air"
    : carrierCode === "n2o"
      ? "O₂/N₂O"
      : "O₂"
  const resolved = resolveClinicalDisplay("carrierGas", carrierCode, locale)
  const carrier = resolved.shortLabel ?? resolved.label
  const localizedPrefix = carrierCode === "air" || carrierCode === "n2o"
    ? `O₂/${carrier}`
    : carrier
  return text.startsWith(sourcePrefix)
    ? `${localizedPrefix}${text.slice(sourcePrefix.length)}`
    : text
}

export function localizeSummaryTimetableModel(
  model: SummaryTimetableModel,
  locale: string | ClinicalLocale,
): SummaryTimetableModel {
  const clinicalLocale = toClinicalLocale(locale)
  return {
    ...model,
    events: model.events.map(event => ({
      ...event,
      label: resolveIntraopEventLabel(event.label, clinicalLocale),
    })),
    drugTicks: model.drugTicks.map(drug => ({
      ...drug,
      name: clinicalDisplayLabel("option:INTRAOP_DRUG", drug.name, clinicalLocale, { label: drug.name }),
    })),
    lanes: model.lanes.map(lane => {
      if (lane.kind === "gas") {
        return {
          ...lane,
          segments: lane.segments.map(segment => segment.code
            ? { ...segment, text: localizeSummaryGasText(segment.text, segment.code, clinicalLocale) }
            : segment),
        }
      }
      const domain = summarySegmentDomain(lane.kind)
      if (!domain) return lane
      return {
        ...lane,
        segments: lane.segments.map(segment => {
          if (!segment.code) return segment
          const label = clinicalDisplayLabel(domain, segment.code, clinicalLocale, { label: segment.code })
          return {
            ...segment,
            text: segment.text.startsWith(segment.code)
              ? `${label}${segment.text.slice(segment.code.length)}`
              : label,
          }
        }),
      }
    }),
  }
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
