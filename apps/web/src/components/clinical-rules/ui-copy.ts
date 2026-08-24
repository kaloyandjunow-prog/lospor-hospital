import { useLocale } from "next-intl"

// Editor chrome only. Canonical rule keys, enum values, drug names, route
// codes, dose bases, units and abbreviations remain unchanged.
const COPY = {
  en: {
    profileType: "Profile type",
    drug: "Drug",
    infusion: "Infusion",
    fluid: "Fluid",
    canonicalKey: "Canonical key",
    englishLabel: "English label",
    bulgarianLabel: "Bulgarian label",
    category: "Category",
    cancel: "Cancel",
    saveRule: "Save rule",
    invalidProfile: "Check the dose profile fields.",
    profileIssues: (detail: string) => detail || "Check the dose profile fields.",
    medication: "Medication",
    selectDrug: "Select drug",
    band: (index: number) => `Band ${index}`,
    duplicateBand: "Duplicate band",
    deleteBand: "Delete band",
    minimumAge: "Minimum age",
    maximumAgeExclusive: "Maximum age (exclusive)",
    days: "days",
    months: "months",
    years: "years",
    minimumWeightOptional: "Minimum weight (optional)",
    maximumWeightOptional: "Maximum weight (optional)",
    any: "Any",
    includeBoundary: "Include boundary",
    manualEntryUnit: "Manual entry unit",
    addBand: "Add age/weight band",
    saveDrugProfile: "Save drug profile",
    bandIssue: (index: number, detail: string) => `Band ${index}: ${detail}`,
    invalidDrugProfile: "Invalid drug profile",
    invalidCollection: "The age/weight bands overlap or leave an invalid boundary. Check every band.",
  },
  bg: {
    profileType: "Тип на профила",
    drug: "Медикамент",
    infusion: "Инфузия",
    fluid: "Течност",
    canonicalKey: "Каноничен ключ",
    englishLabel: "Етикет на английски",
    bulgarianLabel: "Етикет на български",
    category: "Категория",
    cancel: "Отказ",
    saveRule: "Запази правилото",
    invalidProfile: "Проверете полетата на дозовия профил.",
    profileIssues: (_detail: string) => "Проверете полетата на дозовия профил.",
    medication: "Медикамент",
    selectDrug: "Изберете медикамент",
    band: (index: number) => `Група ${index}`,
    duplicateBand: "Дублирай групата",
    deleteBand: "Изтрий групата",
    minimumAge: "Минимална възраст",
    maximumAgeExclusive: "Максимална възраст (без горната граница)",
    days: "дни",
    months: "месеци",
    years: "години",
    minimumWeightOptional: "Минимално тегло (по желание)",
    maximumWeightOptional: "Максимално тегло (по желание)",
    any: "Без ограничение",
    includeBoundary: "Включи граничната стойност",
    manualEntryUnit: "Мерна единица за ръчно въвеждане",
    addBand: "Добави възрастово-тегловна група",
    saveDrugProfile: "Запази профила на медикамента",
    bandIssue: (index: number, _detail: string) => `Група ${index}: проверете въведените стойности.`,
    invalidDrugProfile: "Невалиден профил на медикамент",
    invalidCollection: "Възрастово-тегловните групи се припокриват или имат невалидна граница. Проверете всяка група.",
  },
} as const

export type ClinicalRuleUiCopy = typeof COPY.en | typeof COPY.bg

export function clinicalRuleUiCopy(locale: string): ClinicalRuleUiCopy {
  return locale.toLowerCase().startsWith("bg") ? COPY.bg : COPY.en
}

export function useClinicalRuleUiCopy(): ClinicalRuleUiCopy {
  return clinicalRuleUiCopy(useLocale())
}
