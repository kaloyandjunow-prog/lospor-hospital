import type { ReadinessKind, ReadinessStage } from "@lospor/core/case-readiness"

/**
 * The words for each readiness item.
 *
 * Keyed by Core's `ReadinessKind`, so a kind Core adds is a compile error here
 * rather than a blank line on a ward. Each says what is missing in the
 * clinician's terms, short enough to scan at the end of a case.
 */
export const READINESS_COPY: Record<"en" | "bg", Record<ReadinessKind, string>> = {
  en: {
    missing_preop: "No preoperative assessment",
    incomplete_preop_demographics: "Age, sex, height or weight",
    incomplete_preop_case_details: "Diagnosis or planned procedure",
    incomplete_preop_medical_history: "Medical history",
    incomplete_preop_current_medications: "Current medications",
    incomplete_preop_anamnesis: "Anaesthetic history",
    incomplete_preop_physical_exam: "Blood pressure, heart rate or respiratory rate",
    incomplete_preop_airway: "Airway assessment (Mallampati)",
    incomplete_preop_labs: "Laboratory results",
    incomplete_preop_risk_scores: "ASA class",
    missing_start_time: "Anaesthesia start time",
    missing_end_time: "The case has not been ended",
    invalid_intraop_times: "End time is before the start time",
    entries_after_case_end: "Chart entries after the case end",
    unconfirmed_stops: "An infusion stop is not confirmed",
    missing_technique: "Anaesthetic technique",
    missing_airway_documentation: "Airway device or ventilation",
    missing_position: "Patient position",
    missing_monitoring: "Monitoring used",
    missing_vascular_access: "Vascular access",
    missing_vitals: "No vital signs on the chart",
    missing_medications: "No drugs on the chart",
    missing_fluids: "No fluids on the chart",
    missing_complication_documentation: "Complications (or \"none\")",
    missing_postop: "No postoperative record",
    missing_aldrete: "Aldrete score, every component",
    missing_disposition: "Where the patient goes after recovery",
    unacknowledged_allergy_conflict: "A drug given clashes with a recorded allergy",
    other: "Something else the server requires",
  },
  bg: {
    missing_preop: "Няма предоперативна оценка",
    incomplete_preop_demographics: "Възраст, пол, ръст или тегло",
    incomplete_preop_case_details: "Диагноза или планирана операция",
    incomplete_preop_medical_history: "Анамнеза за заболявания",
    incomplete_preop_current_medications: "Текущи медикаменти",
    incomplete_preop_anamnesis: "Анестезиологична анамнеза",
    incomplete_preop_physical_exam: "Кръвно налягане, пулс или дихателна честота",
    incomplete_preop_airway: "Оценка на дихателните пътища (Mallampati)",
    incomplete_preop_labs: "Лабораторни резултати",
    incomplete_preop_risk_scores: "ASA клас",
    missing_start_time: "Час на започване на анестезията",
    missing_end_time: "Случаят не е приключен",
    invalid_intraop_times: "Крайният час е преди началния",
    entries_after_case_end: "Записи в картата след края на случая",
    unconfirmed_stops: "Спиране на инфузия не е потвърдено",
    missing_technique: "Анестезиологична техника",
    missing_airway_documentation: "Средство за дихателни пътища или вентилация",
    missing_position: "Положение на пациента",
    missing_monitoring: "Използван мониторинг",
    missing_vascular_access: "Съдов достъп",
    missing_vitals: "Няма витални показатели в картата",
    missing_medications: "Няма медикаменти в картата",
    missing_fluids: "Няма инфузии в картата",
    missing_complication_documentation: "Усложнения (или „няма“)",
    missing_postop: "Няма следоперативен запис",
    missing_aldrete: "Скала Aldrete, всички компоненти",
    missing_disposition: "Къде отива пациентът след възстановяването",
    unacknowledged_allergy_conflict: "Приложен медикамент съвпада със записана алергия",
    other: "Друго, което сървърът изисква",
  },
}

export const READINESS_STAGE: Record<"en" | "bg", Record<ReadinessStage, string>> = {
  en: { preop: "Preop", intraop: "Intraop", postop: "Postop" },
  bg: { preop: "Предоп.", intraop: "Интраоп.", postop: "Следоп." },
}

export const READINESS_TEXT = {
  en: {
    title: "Before this case can be finalized",
    warningsTitle: "Worth a look (does not block)",
    goTo: "Go to",
    ready: "Nothing blocks finalizing.",
  },
  bg: {
    title: "Преди случаят да бъде приключен",
    warningsTitle: "Заслужава поглед (не блокира)",
    goTo: "Към",
    ready: "Нищо не пречи на приключването.",
  },
} as const
