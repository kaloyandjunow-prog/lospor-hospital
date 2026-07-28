export const LIBRARY_CATEGORIES = [
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
  "AGE_RANGE",
  "HEIGHT_RANGE",
  "WEIGHT_RANGE",
  "BP_SYSTOLIC_RANGE",
  "BP_DIASTOLIC_RANGE",
  "HEART_RATE_RANGE",
  "SPO2_RANGE",
  "TEMPERATURE_RANGE",
  "RESPIRATORY_RATE_RANGE",
  "MOUTH_OPENING_RANGE",
  "THYROMENTAL_RANGE",
  "ALDRETE_SUBSCORE_RANGE",
  "PAIN_NRS_RANGE",
] as const

export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number]

const LIBRARY_CATEGORY_SET = new Set<string>(LIBRARY_CATEGORIES)

export function isLibraryCategory(value: unknown): value is LibraryCategory {
  return typeof value === "string" && LIBRARY_CATEGORY_SET.has(value)
}

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue | undefined }

export type OptionIdentity = {
  category: LibraryCategory
  value: string
  code?: string
}

export type CanonicalLibraryOption = {
  id: string
  category?: LibraryCategory
  value: string
  label: string
  labelBg: string | null
  group: string | null
  parentId: string | null
  color: string | null
  description: string | null
  drugId: string | null
  atcCode: string | null
  inn: string | null
  metadata: JsonObject | null
}

export function optionIdentity(
  category: LibraryCategory,
  option: Pick<CanonicalLibraryOption, "value" | "drugId" | "atcCode">,
): OptionIdentity {
  return {
    category,
    value: option.value,
    code: option.drugId ?? option.atcCode ?? undefined,
  }
}

export function optionIdentityKey(identity: OptionIdentity): string {
  return `${identity.category}:${identity.value}:${identity.code ?? ""}`
}

export function sameOptionIdentity(a: OptionIdentity, b: OptionIdentity): boolean {
  return a.category === b.category && a.value === b.value && (a.code ?? "") === (b.code ?? "")
}

export function optionPreferenceKey(
  category: LibraryCategory,
  option: Pick<CanonicalLibraryOption, "value" | "drugId" | "atcCode">,
): string {
  return optionIdentityKey(optionIdentity(category, option))
}

export function optionMatchesPreference(
  category: LibraryCategory,
  option: CanonicalLibraryOption,
  preference: string,
): boolean {
  return preference === optionPreferenceKey(category, option)
    || preference === option.value
    || preference === option.label
    || preference === option.labelBg
}

export function canonicalizeOptionPreferences(
  category: LibraryCategory,
  options: CanonicalLibraryOption[],
  preferences: string[],
): string[] {
  const keys = preferences.flatMap(preference => {
    const option = options.find(candidate =>
      optionMatchesPreference(category, candidate, preference),
    )
    return option ? [optionPreferenceKey(category, option)] : []
  })
  return [...new Set(keys)]
}

export function resolveOptionPreferenceLabels(
  category: LibraryCategory,
  options: CanonicalLibraryOption[],
  preferences: string[],
): string[] {
  return preferences.flatMap(preference => {
    const option = options.find(candidate =>
      optionMatchesPreference(category, candidate, preference),
    )
    return option ? [option.label] : []
  })
}

export function isJsonObject(value: unknown): value is JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

export function parseJsonObject(value: unknown): JsonObject | null {
  return isJsonObject(value) ? value : null
}

export function metadataString(metadata: JsonObject | null | undefined, key: string): string | undefined {
  const value = metadata?.[key]
  return typeof value === "string" ? value : undefined
}

export function metadataNumber(metadata: JsonObject | null | undefined, key: string): number | undefined {
  const value = metadata?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function metadataBoolean(metadata: JsonObject | null | undefined, key: string): boolean | undefined {
  const value = metadata?.[key]
  return typeof value === "boolean" ? value : undefined
}

export function metadataStrings(metadata: JsonObject | null | undefined, key: string): string[] {
  const value = metadata?.[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

export function metadataNumbers(metadata: JsonObject | null | undefined, key: string): number[] {
  const value = metadata?.[key]
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : []
}

export function metadataObject(metadata: JsonObject | null | undefined, key: string): JsonObject | null {
  return parseJsonObject(metadata?.[key])
}

export function canonicalOptionLabel(
  option: Pick<CanonicalLibraryOption, "label" | "labelBg" | "value">,
  locale: "en" | "bg",
): string {
  if (locale === "bg") return option.labelBg?.trim() || option.label.trim() || option.value
  return option.label.trim() || option.labelBg?.trim() || option.value
}

export function parseLibraryOption(value: unknown): CanonicalLibraryOption | null {
  if (!isJsonObject(value)) return null
  if (
    typeof value.id !== "string"
    || typeof value.value !== "string"
    || typeof value.label !== "string"
  ) {
    return null
  }
  const nullableString = (field: string): string | null => {
    const candidate = value[field]
    return typeof candidate === "string" ? candidate : null
  }
  return {
    id: value.id,
    category: isLibraryCategory(value.category) ? value.category : undefined,
    value: value.value,
    label: value.label,
    labelBg: nullableString("labelBg"),
    group: nullableString("group"),
    parentId: nullableString("parentId"),
    color: nullableString("color"),
    description: nullableString("description"),
    drugId: nullableString("drugId"),
    atcCode: nullableString("atcCode"),
    inn: nullableString("inn"),
    metadata: parseJsonObject(value.metadata),
  }
}

export function parseLibraryOptions(value: unknown): CanonicalLibraryOption[] {
  if (!Array.isArray(value)) return []
  return value.map(parseLibraryOption).filter((option): option is CanonicalLibraryOption => option != null)
}
