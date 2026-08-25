import type { ClinicalRuleEditorCopy } from "./ClinicalRuleEditor"

const EN: ClinicalRuleEditorCopy = {
  drug: "Drug dose", drugProfile: "Drug profile", drugPolicy: "Drug policy",
  fluidProfile: "Fluid profile", infusionProfile: "Infusion profile",
  medication: "Medication", fluid: "Fluid", infusion: "Infusion", indication: "Indication",
  route: "Route", ageMin: "Minimum age (days)", ageMax: "Maximum age, exclusive (days)",
  basis: "Dose basis", amountPerUnit: "Amount per kg or m2", flatAmount: "Flat amount", flatBasis: "Flat",
  minimumAmount: "Minimum dose", maximumAmount: "Maximum dose", roundTo: "Round to",
  doseUnit: "Dose unit", drugCategory: "Drug category", fluidCategory: "Fluid category",
  infusionCategory: "Infusion category", infusionDisposition: "Infusion behavior",
  manualUnit: "Manual entry unit", profileEnabled: "Use slider/profile surface",
  manualEntryOnly: "Direct entry only", routineSuggestion: "Show in routine suggestions",
  advisory: "Clinical advisory", minimumWeight: "Minimum weight (kg)",
  maximumWeight: "Maximum weight (kg)", minimumWeightInclusive: "Include minimum weight",
  maximumWeightInclusive: "Include maximum weight", labelEn: "English label",
  labelBg: "Bulgarian label", disposition: "Disposition", reviewStatus: "Review status",
  rationaleEn: "English rationale", rationaleBg: "Bulgarian rationale",
  save: "Save rule", cancel: "Cancel", edit: "Edit", invalid: "Check the rule fields.",
}

const BG: ClinicalRuleEditorCopy = {
  drug: "Доза на медикамент", drugProfile: "Профил на медикамент", drugPolicy: "Политика за медикамент",
  fluidProfile: "Профил на течност", infusionProfile: "Профил на инфузия",
  medication: "Медикамент", fluid: "Течност", infusion: "Инфузия", indication: "Показание",
  route: "Път на приложение", ageMin: "Минимална възраст (дни)", ageMax: "Максимална възраст, без горната граница (дни)",
  basis: "Основа за дозиране", amountPerUnit: "Количество на kg или m²", flatAmount: "Фиксирано количество", flatBasis: "Фиксирана доза",
  minimumAmount: "Минимална доза", maximumAmount: "Максимална доза", roundTo: "Закръгли до",
  doseUnit: "Мерна единица за дозата", drugCategory: "Категория медикаменти", fluidCategory: "Категория течности",
  infusionCategory: "Категория инфузии", infusionDisposition: "Поведение на инфузията",
  manualUnit: "Мерна единица за ръчно въвеждане", profileEnabled: "Използвай профилния интерфейс",
  manualEntryOnly: "Само директно въвеждане", routineSuggestion: "Показвай в обичайните предложения",
  advisory: "Клинично предупреждение", minimumWeight: "Минимално тегло (kg)",
  maximumWeight: "Максимално тегло (kg)", minimumWeightInclusive: "Включи минималното тегло",
  maximumWeightInclusive: "Включи максималното тегло", labelEn: "Етикет на английски",
  labelBg: "Етикет на български", disposition: "Поведение", reviewStatus: "Статус на прегледа",
  rationaleEn: "Обосновка на английски", rationaleBg: "Обосновка на български",
  save: "Запази правилото", cancel: "Откажи", edit: "Редактирай", invalid: "Проверете полетата на правилото.",
}

export function clinicalRuleEditorCopy(bg: boolean): ClinicalRuleEditorCopy {
  return bg ? BG : EN
}
