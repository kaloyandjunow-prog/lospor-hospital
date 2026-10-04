import React from "react"
import { Text, TouchableOpacity, View } from "react-native"
import { useRouter } from "expo-router"
import { caseReadiness, type CaseReadiness, type ReadinessItem, type ReadinessKind } from "@lospor/core/case-readiness"
import { usePreferences } from "@/lib/preferences-context"
import { colors, withAlpha } from "@/theme/colors"

type CaseLike = {
  clinicalMode?: string | null
  preop?: unknown
  intraop?: unknown
  postop?: unknown
}

/**
 * The words for each readiness item, the same as the web summary's.
 *
 * Keyed by Core's `ReadinessKind`, so a kind Core adds is a compile error here
 * rather than a blank line.
 */
const COPY: Record<"en" | "bg", Record<ReadinessKind, string>> = {
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

const TEXT = {
  en: { title: "Before this case can be finalised", warnings: "Worth a look (does not block)", goTo: "Go to", stage: { preop: "Preop", intraop: "Intraop", postop: "Postop" } },
  bg: { title: "Преди случаят да бъде приключен", warnings: "Заслужава поглед (не блокира)", goTo: "Към", stage: { preop: "Предоп.", intraop: "Интраоп.", postop: "Следоп." } },
} as const

export function readinessOf(caseData: CaseLike): CaseReadiness {
  return caseReadiness({
    clinicalMode: caseData.clinicalMode === "PEDIATRIC" ? "PEDIATRIC" : "ADULT",
    preop: (caseData.preop ?? null) as Record<string, unknown> | null,
    intraop: (caseData.intraop ?? null) as Record<string, unknown> | null,
    postop: (caseData.postop ?? null) as Record<string, unknown> | null,
  })
}

/**
 * The list to show: the case as it stands now, which follows every edit made
 * since; the server's refusal only when the case looks complete here and the
 * server still said no. This screen stays mounted while the clinician goes
 * and fixes things, so a remembered refusal alone would go stale.
 */
export function shownReadiness(caseData: CaseLike, refusal: CaseReadiness | null): CaseReadiness {
  const local = readinessOf(caseData)
  return local.blockers.length === 0 && refusal ? refusal : local
}

/** "Finalise (3)": the count of what still blocks, beside the button. */
export function finaliseLabel(label: string, caseData: CaseLike, refusal: CaseReadiness | null): string {
  const count = shownReadiness(caseData, refusal).blockers.length
  return count > 0 ? `${label} (${count})` : label
}

/** The screen and part of it a "Go to" opens, as this app routes them. */
export function readinessRoute(caseId: string, item: ReadinessItem): string {
  const target = item.target
  if (target.stage === "preop") {
    return `/(app)/cases/new?continue=${caseId}${target.section ? `&focus=${target.section}` : ""}`
  }
  return `/(app)/cases/${target.stage}/${caseId}?focus=${target.area}`
}

/**
 * Everything that stands between this case and finalising, at once (1.5.0).
 *
 * Blockers first, each with a way to it; warnings after, marked as not
 * blocking.
 */
export function CaseReadinessCard({ caseId, caseData, refusal, canEdit }: {
  caseId: string
  caseData: CaseLike & { status?: string | null }
  refusal: CaseReadiness | null
  canEdit: boolean
}) {
  const router = useRouter()
  const { language } = usePreferences()
  if (!canEdit || caseData.status === "COMPLETE") return null
  const locale = language === "bg" ? "bg" : "en"
  const copy = COPY[locale]
  const text = TEXT[locale]
  const readiness = shownReadiness(caseData, refusal)
  if (readiness.blockers.length === 0 && readiness.warnings.length === 0) return null

  const row = (item: ReadinessItem, blocker: boolean) => (
    <TouchableOpacity
      key={`${item.kind}-${item.target.stage}`}
      onPress={() => router.push(readinessRoute(caseId, item) as never)}
      accessibilityRole="button"
      style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9 }}
    >
      <Text style={{
        color: blocker ? colors.danger : colors.warning, fontSize: 10, fontWeight: "800",
        textTransform: "uppercase", minWidth: 56,
      }}>
        {text.stage[item.target.stage]}
      </Text>
      <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: "600" }}>{copy[item.kind]}</Text>
      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "800" }}>{text.goTo} →</Text>
    </TouchableOpacity>
  )

  return (
    <View style={{
      marginBottom: 16, borderRadius: 12, borderWidth: 1, padding: 12,
      borderColor: withAlpha(readiness.blockers.length > 0 ? colors.danger : colors.warning, "55"),
      backgroundColor: colors.surfaceRaised,
    }}>
      {readiness.blockers.length > 0 ? (
        <>
          <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "900" }}>
            {text.title} ({readiness.blockers.length})
          </Text>
          {readiness.blockers.map(item => row(item, true))}
        </>
      ) : null}
      {readiness.warnings.length > 0 ? (
        <>
          <Text style={{ color: colors.warning, fontSize: 12, fontWeight: "900", marginTop: readiness.blockers.length > 0 ? 8 : 0 }}>
            {text.warnings}
          </Text>
          {readiness.warnings.map(item => row(item, false))}
        </>
      ) : null}
    </View>
  )
}
