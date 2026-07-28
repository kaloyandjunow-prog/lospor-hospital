import {
  clinicalDisplayLabel,
  formatClinicalGasMixLabel as formatCoreClinicalGasMixLabel,
  formatClinicalGasSettingsLabel as formatCoreClinicalGasSettingsLabel,
  resolveClinicalDisplay,
  resolveOptionDisplay,
  optionDisplayEntry as coreOptionDisplayEntry,
  optionDisplayPath,
  type ClinicalDisplayDomain,
  type ClinicalLocale,
  type DynamicClinicalLabels,
  type ResolvedClinicalDisplay,
} from "@lospor/core/display"
import type { LibraryCategory } from "@lospor/core/option-contracts"
import type { GasDisplaySettings } from "@lospor/core/intraop-summary"
import type { LibraryOption } from "@lospor/core/option-library"
import type { SummaryLaneKind, SummaryTimetableModel } from "@lospor/core/summary-timetable"

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

function summarySegmentDomain(kind: SummaryLaneKind): ClinicalDisplayDomain | null {
  if (kind === "agent") return "option:INHALATIONAL_AGENT"
  if (kind === "infusion") return "option:INTRAOP_INFUSION"
  if (kind === "fluid") return "option:INTRAOP_FLUID"
  if (kind === "position") return "option:POSITION"
  return null
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
    events: model.events.map(event => {
      const option = resolveClinicalDisplay("option:INTRAOP_EVENT", event.label, clinicalLocale)
      return {
        ...event,
        label: option.known
          ? option.label
          : clinicalDisplayLabel("complication", event.label, clinicalLocale, { label: event.label }),
      }
    }),
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
  return formatCoreClinicalGasMixLabel(settings, toClinicalLocale(locale))
}

export function displayGasSettings(
  settings: GasDisplaySettings,
  locale: string | ClinicalLocale,
): string {
  return formatCoreClinicalGasSettingsLabel(settings, toClinicalLocale(locale))
}
