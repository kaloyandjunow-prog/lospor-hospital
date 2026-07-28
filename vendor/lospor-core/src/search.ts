export type ClinicalSearchKind = "icd10" | "procedure" | "medication"

export const CLINICAL_SEARCH_MIN_LENGTH: Readonly<Record<ClinicalSearchKind, number>> = {
  icd10: 2,
  procedure: 3,
  medication: 2,
}

export type ClinicalSearchLocale = "en" | "bg"

export type Icd10SearchResult = {
  code: string
  description: string
  descriptionBg?: string
  display?: string
  system?: string
}

export type ProcedureSearchResult = {
  code: string
  description: string
  group: string
  domain: string
}

export type MedicationSearchResult = {
  id?: string
  name: string
  inn?: string
  form?: string
  strength?: string
  atc?: string
  atcCode?: string
}

export type CanonicalSearchTag = {
  code: string
  label: string
  sub?: string
  system?: string
  labelEn?: string
  labelBg?: string
  inn?: string
  atcCode?: string
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

export function parseClinicalSearchResult(
  kind: ClinicalSearchKind,
  value: unknown,
  locale: ClinicalSearchLocale = "en",
): CanonicalSearchTag | null {
  const item = record(value)
  if (!item) return null
  if (kind === "icd10") {
    const code = text(item.code)
    const description = text(item.description)
    if (!code || !description) return null
    const descriptionBg = text(item.descriptionBg)
    return {
      code,
      label: locale === "bg" && descriptionBg ? descriptionBg : description,
      sub: code,
      system: text(item.system) ?? "ICD-10",
      labelEn: description,
      ...(descriptionBg ? { labelBg: descriptionBg } : {}),
    }
  }
  if (kind === "procedure") {
    const code = text(item.code)
    const group = text(item.group)
    const description = text(item.description)
    const domain = text(item.domain)
    if (!code || (!group && !description)) return null
    return {
      code,
      label: group ?? description!,
      sub: domain ? `${code} \u00b7 ${domain}` : code,
      system: domain,
    }
  }
  const name = text(item.name)
  const inn = text(item.inn)
  if (!name && !inn) return null
  const strength = text(item.strength)
  const atcCode = text(item.atcCode) ?? text(item.atc)
  return {
    code: atcCode ?? inn ?? name!,
    label: inn ? `${inn}${strength ? ` ${strength}` : ""}` : name!,
    ...(name && name !== inn ? { sub: name } : {}),
    ...(inn ? { inn } : {}),
    ...(atcCode ? { atcCode } : {}),
  }
}

export function parseClinicalSearchResults(
  kind: ClinicalSearchKind,
  value: unknown,
  locale: ClinicalSearchLocale = "en",
): CanonicalSearchTag[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const parsed = parseClinicalSearchResult(kind, item, locale)
    return parsed ? [parsed] : []
  })
}
