import type { PreopFormData, PreopFormInput, PreopSection } from "@/lib/preop-form-schema"
import {
  evaluatePreopSectionCompletion,
  type PreopSection as CorePreopSection,
} from "@lospor/core/clinical-validation"

export type PreopSectionLabel = {
  key: PreopSection
  label: string
}

export type PreopSectionOverviewText = {
  patientHint: string
  diagnosisAndProcedure: string
  comorbidities: string
  meds: string
  flags: string
  vitalsRequired: string
  mallampatiRequired: string
  labsHint: string
  asaRequired: string
}

export type PreopSectionOverviewItem = PreopSectionLabel & {
  done: boolean
  required: boolean
  summary: string
}

type PreopSectionValues = Partial<PreopFormInput & PreopFormData>

export function buildPreopSectionItems(
  values: PreopSectionValues,
  labels: PreopSectionLabel[],
  text: PreopSectionOverviewText
): PreopSectionOverviewItem[] {
  const completion = evaluatePreopSectionCompletion(values as Record<string, unknown>)
  const coreSection: Record<PreopSection, CorePreopSection> = {
    patient: "demographics",
    case: "case_details",
    history: "medical_history",
    meds: "current_medications",
    anamnesis: "anamnesis",
    exam: "physical_exam",
    airway: "airway",
    labs: "labs",
    risk: "risk_scores",
  }
  const requiredSections = new Set<PreopSection>([
    "patient", "case", "exam", "airway", "risk",
  ])
  const hasBP = values.bpSystolic != null || !!values.bpUnobtainable
  const hasHR = values.heartRate != null || !!values.heartRateUnobtainable
  const hasSpO2 = values.spO2 != null || !!values.spO2Unobtainable

  return labels.map(({ key, label }) => {
    let done = false
    let required = false
    let summary = ""

    switch (key) {
      case "patient":
        required = true
        done = values.ageYears != null
        summary = values.ageYears != null
          ? `${values.ageYears}y \u00b7 ${values.sex ?? "-"} \u00b7 ${values.weightKg ?? "-"}kg`
          : text.patientHint
        break
      case "case":
        done = (values.diagnoses?.length ?? 0) > 0 || (values.procedures?.length ?? 0) > 0
        summary = values.procedures?.[0]?.label ?? values.diagnoses?.[0]?.label ?? text.diagnosisAndProcedure
        break
      case "history":
        done = (values.comorbidities?.length ?? 0) > 0
        summary = done ? `${values.comorbidities?.length} comorbidities` : text.comorbidities
        break
      case "meds":
        done = (values.currentMedications?.length ?? 0) > 0
        summary = done ? `${values.currentMedications?.length} medications` : text.meds
        break
      case "anamnesis":
        done = !!(values.allergies || values.familyAnesthesiaProblems || values.smoking || values.substanceAbuse || values.dentalProsthetics || values.looseTeeth)
        summary = [
          values.allergies && "Allergy",
          values.smoking && "Smoker",
          values.familyAnesthesiaProblems && "Family hx",
        ].filter(Boolean).join(" \u00b7 ") || text.flags
        break
      case "exam":
        required = true
        done = hasBP && hasHR && hasSpO2
        summary = values.bpSystolic != null
          ? `BP ${values.bpSystolic}/${values.bpDiastolic ?? "?"} \u00b7 HR ${values.heartRate ?? "-"}`
          : text.vitalsRequired
        break
      case "airway":
        required = true
        done = values.mallampati != null || !!values.airwayUnobtainable
        summary = values.mallampati != null ? `Mallampati ${values.mallampati}` : text.mallampatiRequired
        break
      case "labs":
        done = (values.labResults?.length ?? 0) > 0
        summary = done ? `${values.labResults?.length} results` : text.labsHint
        break
      case "risk":
        required = true
        done = values.asaScore != null
        summary = values.asaScore != null
          ? `ASA ${values.asaScore}${values.emergencySurgery ? "E" : ""}`
          : text.asaRequired
        break
    }

    done = completion[coreSection[key]] === "complete"
    required = requiredSections.has(key)
    return { key, label, done, required, summary }
  })
}
