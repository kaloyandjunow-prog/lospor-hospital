import {
  clinicalDisplayLabel,
  formatClinicalGasMixLabel as formatCoreClinicalGasMixLabel,
  formatClinicalGasSettingsLabel as formatCoreClinicalGasSettingsLabel,
  optionDisplayEntry as coreOptionDisplayEntry,
  resolveClinicalDisplay,
  resolveOptionDisplay,
  type ClinicalDisplayDomain,
  type ClinicalLocale,
  type DynamicClinicalLabels,
  type ResolvedClinicalDisplay,
} from "@lospor/core/display"
import type { LibraryCategory } from "@lospor/core/option-contracts"
import type { GasDisplaySettings } from "@lospor/core/intraop-summary"
import type { LibraryOption } from "@lospor/core/option-library"

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

export function displayOptionEntry(
  category: LibraryCategory,
  entry: string,
  locale: string | ClinicalLocale,
): string {
  return coreOptionDisplayEntry(category, entry, toClinicalLocale(locale))
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
