import { broselowZone } from "@lospor/core/broselow"
import type { PreopSectionKey } from "@lospor/core/preop-orders"
import type { PreopSidebarProps } from "@/components/forms/PreopSidebar"

type MaybeValue = string | number | null | undefined

type PreopSidebarModelArgs = {
  t: (key: string) => string
  sectionOn: (key: PreopSectionKey) => boolean
  anyMissing: (...keys: string[]) => boolean
  isPediatric: boolean
  preopMode: "ADULT" | "PEDIATRIC"
  ageValue: MaybeValue
  ageUnit: string | null | undefined
  ageYearsVal: MaybeValue
  sex: string | null | undefined
  height: MaybeValue
  weight: MaybeValue
  bmi: number | null
  allergies: boolean | null | undefined
  allergyTags: string[]
  locale: string
  rcriAnswered: number
  rcriScore: number | null
  apfelAnswered: number
  apfelScore: number | null
  stopBangAnswered: number
  stopBangScore: number | null
  asaChosen: string | null
  asaSuggested: string | null
  disabled: boolean
  stages: PreopSidebarProps["stages"]
}

function ageUnitText(unit: string | null | undefined, locale: string) {
  return unit === "MONTHS"
    ? (locale === "bg" ? "м." : "mo")
    : unit === "DAYS"
      ? (locale === "bg" ? "д." : "d")
      : (locale === "bg" ? "г." : "y")
}

export function buildPreopSidebarModel({
  t, sectionOn, anyMissing, isPediatric, preopMode, ageValue, ageUnit,
  ageYearsVal, sex, height, weight, bmi, allergies, allergyTags, locale,
  rcriAnswered, rcriScore, apfelAnswered, apfelScore, stopBangAnswered,
  stopBangScore, asaChosen, asaSuggested, disabled, stages,
}: PreopSidebarModelArgs) {
  const sections: PreopSidebarProps["sections"] = [
    { id: "demographics", label: t("preop.demographicsSection"), missing: anyMissing("ageYears", "ageValue", "sex", "heightCm", "weightKg") },
    { id: "case", label: t("preop.caseSection"), missing: anyMissing("diagnoses", "procedures") },
    ...(sectionOn("MEDICAL_HISTORY") ? [{ id: "history", label: t("preop.historySection"), missing: false }] : []),
    ...(sectionOn("CURRENT_MEDICATIONS") ? [{ id: "medications", label: t("preop.medicationsSection"), missing: false }] : []),
    { id: "anamnesis", label: t("preop.historyCardTitle"), missing: false },
    { id: "vitals", label: t("preop.vitalsSection"), missing: anyMissing("bp", "heartRate", "respiratoryRate") },
    { id: "airway", label: t("preop.airwaySection"), missing: anyMissing("airway") },
    ...(sectionOn("LABS") ? [{ id: "labs", label: t("preop.sidebar.labs"), missing: false }] : []),
    { id: "risk", label: t("preop.riskSection"), missing: anyMissing("asaScore") },
    ...(sectionOn("PLANNED_ANAESTHESIA") ? [{ id: "planned", label: t("preop.plannedAnaesthesia"), missing: false }] : []),
    ...(sectionOn("PREMEDICATION") ? [{ id: "premedication", label: t("preop.premedication.title"), missing: false }] : []),
    ...(isPediatric && sectionOn("PEDIATRIC_FASTING") ? [{ id: "fasting", label: t("preop.fastingSection"), missing: false }] : []),
    ...(sectionOn("WARD_ORDERS") ? [{ id: "ward-orders", label: t("preop.orders.wardTitle"), missing: false }] : []),
    ...(sectionOn("MEDICATION_INSTRUCTIONS") ? [{ id: "medication-instructions", label: t("preop.orders.medicationTitle"), missing: false }] : []),
    { id: "notes", label: t("preop.notesLabel"), missing: false },
  ]
  const props: PreopSidebarProps = {
    sections,
    patient: {
      ageText: ageValue != null && ageUnit ? `${ageValue} ${ageUnitText(ageUnit, locale)}` : ageYearsVal != null ? `${ageYearsVal} ${ageUnitText("YEARS", locale)}` : null,
      sexText: sex === "MALE" ? (locale === "bg" ? "М" : "M") : sex === "FEMALE" ? (locale === "bg" ? "Ж" : "F") : null,
      heightCm: height ? Number(height) : null,
      weightKg: weight ? Number(weight) : null,
      bmi,
      allergy: allergies === true,
      allergyDetails: allergyTags,
    },
    broselow: broselowZone({ clinicalMode: preopMode, heightCm: height ? Number(height) : null, weightKg: weight ? Number(weight) : null }),
    scores: isPediatric ? [] : [
      { label: t("preop.rcriShort"), value: rcriAnswered > 0 ? rcriScore : null, max: 6 },
      { label: t("preop.apfelShort"), value: apfelAnswered > 0 ? apfelScore : null, max: 4 },
      { label: t("preop.stopBangShort"), value: stopBangAnswered > 0 ? stopBangScore : null, max: 8 },
    ],
    asa: { chosen: asaChosen, suggested: asaSuggested },
    disabled,
    stages,
  }
  return { sections, props }
}
