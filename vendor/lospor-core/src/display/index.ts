import { CASE_STATUS_LABELS } from "../case-status"
import { formatGasMixLabel, type GasDisplaySettings } from "../intraop-summary"
import {
  buildOptionTree,
  catalogOption,
  catalogOptions,
  findOptionPath,
  formatTechniquePath,
} from "../catalog"
import { COMPLICATION_CATEGORIES } from "../complications"
import { LAB_CATEGORIES } from "../labs"
import {
  isLibraryCategory,
  type CanonicalLibraryOption,
  type LibraryCategory,
} from "../option-contracts"
import { normalizeOptionCode } from "../option-aliases"
import { STATIC_CLINICAL_DISPLAY_TERMS } from "./terms"
import { clinicalDisplayReviewStatus } from "./review"
import type {
  BulgarianDisplaySource,
  ClinicalDisplayDomain,
  ClinicalDisplayTerm,
  ClinicalLocale,
  DynamicClinicalLabels,
  ResolvedClinicalDisplay,
} from "./types"

export * from "./types"
export { STATIC_CLINICAL_DISPLAY_TERMS } from "./terms"
export {
  APPROVED_CLINICAL_DISPLAY_TERMS,
  INTERNATIONAL_FLUID_DISPLAY_DOMAINS,
  INTERNATIONAL_LAB_DISPLAY_DOMAINS,
  INTERNATIONAL_MEDICATION_DISPLAY_DOMAINS,
} from "./review"

export const CLINICAL_DISPLAY_VERSION = 1

function clean(value: string | null | undefined): string | undefined {
  const result = value?.trim()
  return result || undefined
}

function displayKey(domain: ClinicalDisplayDomain, code: string): string {
  return `${domain}:${code.trim().toLocaleLowerCase("en")}`
}

function bgSource(en: string, bg: string | null | undefined): BulgarianDisplaySource {
  const localized = clean(bg)
  if (!localized) return "fallback"
  return localized === en ? "international" : "translated"
}

function pendingTerm(
  domain: ClinicalDisplayDomain,
  code: string,
  en: string,
  bg: string | null | undefined,
  options: {
    descriptionEn?: string | null
    descriptionBg?: string | null
    aliases?: readonly string[]
  } = {},
): ClinicalDisplayTerm {
  const labelEn = clean(en) ?? code
  const labelBg = clean(bg) ?? labelEn
  const descriptionEn = clean(options.descriptionEn)
  const descriptionBg = clean(options.descriptionBg) ?? descriptionEn
  return {
    domain,
    code,
    label: { en: labelEn, bg: labelBg },
    ...(descriptionEn && descriptionBg
      ? { description: { en: descriptionEn, bg: descriptionBg } }
      : {}),
    ...(options.aliases?.length ? { aliases: options.aliases } : {}),
    reviewStatus: clinicalDisplayReviewStatus(domain, code),
    bgSource: bgSource(labelEn, bg),
  }
}

const CASE_STATUS_TERMS: ClinicalDisplayTerm[] = Object.entries(CASE_STATUS_LABELS)
  .map(([code, labels]) => pendingTerm("caseStatus", code, labels.en, labels.bg))

function optionDomain(category: LibraryCategory): ClinicalDisplayDomain {
  return `option:${category}`
}

const DISPLAY_OPTION_CATEGORIES = [
  "POSITION",
  "AIRWAY_MANAGEMENT",
  "VASCULAR_ACCESS",
  "TECHNIQUE",
  "MONITORING",
  "PREMED_DRUG",
  "INTRAOP_EVENT",
  "INTRAOP_DRUG",
  "INTRAOP_INFUSION",
  "INHALATIONAL_AGENT",
  "INTRAOP_FLUID",
  "SEX",
  "BLOOD_GROUP",
  "NECK_MOBILITY",
  "MALLAMPATI",
  "UPPER_LIP_BITE",
  "CORMACK_LEHANE",
  "DISPOSITION",
  "HANDOVER_ITEM",
] as const satisfies readonly LibraryCategory[]

function optionTerms(): ClinicalDisplayTerm[] {
  const terms: ClinicalDisplayTerm[] = []
  for (const category of DISPLAY_OPTION_CATEGORIES) {
    for (const option of catalogOptions(category)) {
      terms.push(pendingTerm(
        optionDomain(category),
        option.value,
        option.label,
        option.labelBg,
        { descriptionEn: option.description },
      ))
    }
  }
  return terms
}

function optionGroupTerms(): ClinicalDisplayTerm[] {
  const registered = new Set(
    STATIC_CLINICAL_DISPLAY_TERMS
      .filter(term => term.domain === "optionGroup")
      .map(term => displayKey(term.domain, term.code)),
  )
  const groups = new Set<string>()
  for (const category of DISPLAY_OPTION_CATEGORIES) {
    for (const option of catalogOptions(category)) {
      const group = clean(option.group)
      if (group && !registered.has(displayKey("optionGroup", group))) groups.add(group)
    }
  }
  return [...groups]
    .sort((left, right) => left.localeCompare(right, "en"))
    .map(group => pendingTerm("optionGroup", group, group, null))
}

function labTerms(): ClinicalDisplayTerm[] {
  return LAB_CATEGORIES.flatMap(category => [
    pendingTerm("labCategory", category.id, category.label, category.label),
    ...category.tests.map(test => pendingTerm("labTest", test.name, test.name, test.name)),
  ])
}

function complicationTerms(): ClinicalDisplayTerm[] {
  const registered = new Set(
    STATIC_CLINICAL_DISPLAY_TERMS
      .filter(term => term.domain === "complication")
      .map(term => displayKey(term.domain, term.code)),
  )
  return COMPLICATION_CATEGORIES.flatMap(category => [
    ...(registered.has(displayKey("complication", category.id))
      ? []
      : [pendingTerm("complication", category.id, category.title, category.titleBg)]),
    ...category.items
      .filter(item => !registered.has(displayKey("complication", item)))
      .map(item => pendingTerm("complication", item, item, null)),
  ])
}
const INVENTORY = [
  ...STATIC_CLINICAL_DISPLAY_TERMS,
  ...CASE_STATUS_TERMS,
  ...optionTerms(),
  ...optionGroupTerms(),
  ...labTerms(),
  ...complicationTerms(),
]

const TERM_BY_KEY = new Map<string, ClinicalDisplayTerm>()
for (const term of INVENTORY) {
  TERM_BY_KEY.set(displayKey(term.domain, term.code), term)
  for (const alias of term.aliases ?? []) {
    TERM_BY_KEY.set(displayKey(term.domain, alias), term)
  }
}

export function humanizeClinicalCode(code: string): string {
  const cleaned = code
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
  if (!cleaned) return "Unknown"
  if (/^[IVX]+[a-z]?$/i.test(cleaned)) return cleaned
  return cleaned.charAt(0).toLocaleUpperCase("en") + cleaned.slice(1).toLocaleLowerCase("en")
}

function resolveRuntimeLabels(
  domain: ClinicalDisplayDomain,
  code: string,
  locale: ClinicalLocale,
  dynamic: DynamicClinicalLabels,
): ResolvedClinicalDisplay | null {
  const labelEn = clean(dynamic.labelEn) ?? clean(dynamic.label) ?? clean(dynamic.labelBg)
  if (!labelEn) return null
  const labelBg = clean(dynamic.labelBg) ?? labelEn
  const descriptionEn = clean(dynamic.descriptionEn) ?? clean(dynamic.description)
  const descriptionBg = clean(dynamic.descriptionBg) ?? descriptionEn
  return {
    domain,
    code,
    label: locale === "bg" ? labelBg : labelEn,
    labelEn,
    labelBg,
    ...(locale === "bg" && descriptionBg
      ? { description: descriptionBg }
      : descriptionEn
        ? { description: descriptionEn }
        : {}),
    known: true,
    reviewStatus: domain === "diagnosis" || domain === "procedure" || domain === "medication"
      ? "approved"
      : "pending",
    bgSource: bgSource(labelEn, dynamic.labelBg),
  }
}

export function resolveClinicalDisplay(
  domain: ClinicalDisplayDomain,
  code: string | null | undefined,
  locale: ClinicalLocale,
  dynamic: DynamicClinicalLabels = {},
): ResolvedClinicalDisplay {
  const sourceCode = clean(code) ?? "UNKNOWN"

  if (domain.startsWith("option:")) {
    const category = domain.slice("option:".length)
    if (isLibraryCategory(category)) {
      const canonicalCode = normalizeOptionCode(category, sourceCode)
      const sourceLabel = sourceCode.toLocaleLowerCase("en")
      const option = catalogOption(category, canonicalCode)
        ?? catalogOptions(category).find(candidate =>
          candidate.label.toLocaleLowerCase("en") === sourceLabel
          || candidate.labelBg?.toLocaleLowerCase("bg") === sourceCode.toLocaleLowerCase("bg"),
        )
      if (option) {
        const labelEn = clean(option.label) ?? option.value
        const labelBg = clean(option.labelBg) ?? clean(dynamic.labelBg) ?? labelEn
        const descriptionEn = clean(option.description) ?? clean(dynamic.descriptionEn) ?? clean(dynamic.description)
        const descriptionBg = clean(dynamic.descriptionBg) ?? descriptionEn
        return {
          domain,
          code: option.value,
          label: locale === "bg" ? labelBg : labelEn,
          labelEn,
          labelBg,
          ...(locale === "bg" && descriptionBg
            ? { description: descriptionBg }
            : descriptionEn
              ? { description: descriptionEn }
              : {}),
          known: true,
          reviewStatus: clinicalDisplayReviewStatus(domain, option.value),
          bgSource: bgSource(labelEn, option.labelBg ?? dynamic.labelBg),
        }
      }
    }
  }

  const registered = TERM_BY_KEY.get(displayKey(domain, sourceCode))
  if (registered) {
    return {
      domain,
      code: registered.code,
      label: registered.label[locale],
      labelEn: registered.label.en,
      labelBg: registered.label.bg,
      ...(registered.shortLabel ? { shortLabel: registered.shortLabel[locale] } : {}),
      ...(registered.description ? { description: registered.description[locale] } : {}),
      known: true,
      reviewStatus: registered.reviewStatus,
      bgSource: registered.bgSource,
    }
  }

  const runtime = resolveRuntimeLabels(domain, sourceCode, locale, dynamic)
  if (runtime) return runtime

  const fallback = humanizeClinicalCode(sourceCode)
  return {
    domain,
    code: sourceCode,
    label: fallback,
    labelEn: fallback,
    labelBg: fallback,
    known: false,
    reviewStatus: "pending",
    bgSource: "fallback",
  }
}

export function clinicalDisplayLabel(
  domain: ClinicalDisplayDomain,
  code: string | null | undefined,
  locale: ClinicalLocale,
  dynamic?: DynamicClinicalLabels,
): string {
  return resolveClinicalDisplay(domain, code, locale, dynamic).label
}

export function clinicalShortDisplayLabel(
  domain: ClinicalDisplayDomain,
  code: string | null | undefined,
  locale: ClinicalLocale,
  dynamic?: DynamicClinicalLabels,
): string {
  const resolved = resolveClinicalDisplay(domain, code, locale, dynamic)
  return resolved.shortLabel ?? resolved.label
}

export function formatClinicalGasMixLabel(
  settings: GasDisplaySettings,
  locale: ClinicalLocale,
): string {
  const raw = formatGasMixLabel(settings)
  const carrierCode = clean(settings.carrierGas)?.toLocaleLowerCase("en") ?? "o2"
  const sourcePrefix = carrierCode === "air"
    ? "O2/Air"
    : carrierCode === "n2o"
      ? "O2/N2O"
      : "O2"
  const carrier = clinicalShortDisplayLabel("carrierGas", carrierCode, locale)
  const localizedPrefix = carrierCode === "air" || carrierCode === "n2o"
    ? `O₂/${carrier}`
    : carrier
  return raw.startsWith(sourcePrefix)
    ? `${localizedPrefix}${raw.slice(sourcePrefix.length)}`
    : raw
}

export function formatClinicalGasSettingsLabel(
  settings: GasDisplaySettings,
  locale: ClinicalLocale,
): string {
  return `FGF ${settings.fgf} L/min · ${formatClinicalGasMixLabel(settings, locale)}`
}

export function resolveOptionDisplay(
  category: LibraryCategory,
  option: Pick<CanonicalLibraryOption, "value" | "label" | "labelBg" | "description">,
  locale: ClinicalLocale,
): ResolvedClinicalDisplay {
  return resolveClinicalDisplay(optionDomain(category), option.value, locale, {
    label: option.label,
    labelBg: option.labelBg,
    description: option.description,
  })
}

export function optionDisplayPath(
  category: LibraryCategory,
  value: string,
  locale: ClinicalLocale,
): string {
  const canonicalValue = normalizeOptionCode(category, value)
  const tree = buildOptionTree(catalogOptions(category))
  const path = findOptionPath(tree, canonicalValue)
  if (!path?.length) {
    return clinicalDisplayLabel(`option:${category}`, canonicalValue, locale)
  }
  const labels = path.map(node => resolveOptionDisplay(category, node.option, locale).label)
  return category === "TECHNIQUE"
    ? formatTechniquePath(canonicalValue, labels)
    : labels.join(" › ")
}

export function optionDisplayEntry(
  category: LibraryCategory,
  entry: string,
  locale: ClinicalLocale,
): string {
  const candidates = catalogOptions(category)
    .flatMap(option => [option.value, option.label, option.labelBg].filter((value): value is string => !!clean(value)))
    .sort((left, right) => right.length - left.length)
  const prefix = candidates.find(candidate => entry === candidate || entry.startsWith(`${candidate} `))
  if (!prefix) return entry
  const display = resolveClinicalDisplay(`option:${category}`, prefix, locale, { label: prefix }).label
  return `${display}${entry.slice(prefix.length)}`
}

export function clinicalDisplaySearchText(
  term: Pick<ClinicalDisplayTerm, "code" | "label" | "aliases">,
): string {
  return [term.code, term.label.en, term.label.bg, ...(term.aliases ?? [])]
    .join(" ")
    .toLocaleLowerCase("en")
}

export function clinicalDisplayInventory(): readonly ClinicalDisplayTerm[] {
  return INVENTORY
}

export function pendingClinicalDisplayTerms(): readonly ClinicalDisplayTerm[] {
  return INVENTORY.filter(term => term.reviewStatus === "pending")
}
