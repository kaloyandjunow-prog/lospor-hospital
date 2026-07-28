import { catalogOptions } from "@lospor/core/catalog"
import type { LibraryCategory } from "@lospor/core/option-contracts"
import {
  clinicalDisplayInventory,
  clinicalDisplayLabel,
  resolveClinicalDisplay,
  type ClinicalDisplayDomain,
  type ClinicalLocale,
  type DynamicClinicalLabels,
} from "@lospor/core/display"
import type {
  ResearchDistributionBucket,
  ResearchDistributionId,
  ResearchTimelineEvent,
} from "@lospor/core/research"

export type ClinicalChoice = {
  code: string
  label: string
  group?: string | null
}

export function optionDisplayDomain(category: LibraryCategory): `option:${LibraryCategory}` {
  return `option:${category}`
}

export function optionDisplayLabel(
  category: LibraryCategory,
  code: string | null | undefined,
  locale: ClinicalLocale,
  dynamic: DynamicClinicalLabels = {},
): string {
  return clinicalDisplayLabel(optionDisplayDomain(category), code, locale, dynamic)
}

export function optionChoices(
  category: LibraryCategory,
  locale: ClinicalLocale,
): ClinicalChoice[] {
  return catalogOptions(category).map(option => ({
    code: option.value,
    label: optionDisplayLabel(category, option.value, locale, {
      label: option.label,
      labelBg: option.labelBg,
    }),
    group: option.group,
  }))
}

export function complicationChoices(locale: ClinicalLocale): ClinicalChoice[] {
  return clinicalDisplayInventory()
    .filter(term => term.domain === "complication" && term.code !== term.code.toLocaleLowerCase("en"))
    .map(term => ({ code: term.code, label: term.label[locale] }))
}

export function displayResearchFieldValue(
  field: string,
  value: string | number | boolean | null,
  locale: ClinicalLocale,
): string {
  if (value == null || value === "") return "?"
  if (typeof value === "boolean") return clinicalDisplayLabel("boolean", String(value), locale)
  if (typeof value === "number") return String(value)

  const categories: Partial<Record<string, LibraryCategory>> = {
    sex: "SEX",
    techniques: "TECHNIQUE",
    positions: "POSITION",
    monitoring: "MONITORING",
    airwayDevice: "AIRWAY_MANAGEMENT",
    disposition: "DISPOSITION",
    handover: "HANDOVER_ITEM",
  }
  const category = categories[field]
  return category ? optionDisplayLabel(category, value, locale) : value
}

function distributionDomain(id: ResearchDistributionId): ClinicalDisplayDomain | null {
  if (id === "status") return "caseStatus"
  if (id === "technique") return "option:TECHNIQUE"
  if (id === "airway") return "option:AIRWAY_MANAGEMENT"
  if (id === "disposition") return "option:DISPOSITION"
  if (id === "sex") return "option:SEX"
  if (id === "complication") return "complication"
  if (id === "diagnosis") return "diagnosis"
  if (id === "procedure") return "procedure"
  return null
}

export function displayDistributionBucket(
  distributionId: ResearchDistributionId,
  bucket: ResearchDistributionBucket,
  locale: ClinicalLocale,
): string {
  const domain = distributionDomain(distributionId)
  if (!domain) return bucket.label
  return resolveClinicalDisplay(domain, bucket.key, locale, {
    label: bucket.label,
    labelEn: bucket.labelEn,
    labelBg: bucket.labelBg,
  }).label
}

export function displayTimelineEvent(
  event: ResearchTimelineEvent,
  locale: ClinicalLocale,
): string {
  if (event.code) {
    const option = resolveClinicalDisplay("option:INTRAOP_EVENT", event.code, locale, {
      label: event.label,
      labelEn: event.labelEn,
      labelBg: event.labelBg,
    })
    if (option.known) return option.label
  }
  const eventType = resolveClinicalDisplay("eventType", event.type, locale, {
    label: event.label,
    labelEn: event.labelEn,
    labelBg: event.labelBg,
  })
  return eventType.known ? eventType.label : event.label
}
