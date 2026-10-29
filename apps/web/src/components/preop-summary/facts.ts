import { displayResearchScore } from "@lospor/core/research-scores"
import { calculateMostellerBsa } from "@lospor/core/pediatric-calculators"
import {
  CONSENT_PARENT_ONLY_BELOW_YEARS,
  preopAgeInYears,
  type PreopDocumentsResponse,
  type PreopQuestionnaireItem,
  allergyLine,
  titledName,
} from "@lospor/core/preop-documents"
import { plannedAnaesthesiaText } from "@lospor/core/preop-plan"
import { broselowZone } from "@lospor/core/broselow"
import { specialtyLabel } from "@lospor/core/nhis-specialties"
import { holdHoursText, medicationInstructionText, wardOrderText, type PreopMedicationInstruction, type PreopWardOrder } from "@lospor/core/preop-orders"
import { premedicationEntries } from "@lospor/core/premedication"
import { displayOptionEntry } from "@/lib/clinical-display"
import type { CaseDetail } from "@/types/case-detail"
import { printGeneratedDate } from "@/components/case-summary/print-format"
import { preopSummaryLabels, type PreopSummaryLabels } from "./labels"

/** The print data the sheets read: the case, who consulted, who has it, the questionnaire. */
export type PreopSummaryData = CaseDetail & {
  createdBy?: { name: string; title?: string | null } | null
  user?: { name: string; title?: string | null } | null
  preopDocuments?: PreopDocumentsResponse | null
  preopQuestionnaire?: PreopQuestionnaireItem[] | null
}

export type Tag = { label?: string; code?: string }

export function listOfLabels(raw: unknown): Tag[] {
  if (Array.isArray(raw)) return raw.filter((item): item is Tag => !!item && typeof item === "object")
  if (typeof raw !== "string" || !raw.trim()) return []
  const trimmed = raw.trim()
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) return parsed.map(item => {
        const value = item as { label?: unknown; inn?: unknown; name?: unknown; atcCode?: unknown; code?: unknown }
        const label = value.label ?? value.inn ?? value.name
        const code = value.atcCode ?? value.code
        return { label: typeof label === "string" ? label : undefined, code: typeof code === "string" ? code : undefined }
      }).filter(tag => !!tag.label)
    } catch {}
  }
  return [{ label: trimmed }]
}

const personName = titledName

/**
 * What every layout prints about the case, worked out once: the sheets only
 * arrange it. Nothing here is the patient's name or ID -- those are lines
 * for the pen on every layout.
 */
export function summaryFacts(data: PreopSummaryData, locale: string, printedAt: Date) {
  const L: PreopSummaryLabels = preopSummaryLabels(locale)
  const lang: "en" | "bg" = locale === "bg" ? "bg" : "en"
  const p = data.preop
  const zone = data.intraop?.timezone ?? null
  const ageYears = preopAgeInYears(p)

  const ageText = p?.ageValue != null && p.ageUnit
    ? `${p.ageValue} ${p.ageUnit === "YEARS" ? L.years : p.ageUnit === "MONTHS" ? L.months : L.days}`
    : p?.ageYears != null ? `${p.ageYears} ${L.years}` : null
  const bsaResult = p?.heightCm && p?.weightKg ? calculateMostellerBsa({ heightCm: p.heightCm, weightKg: p.weightKg }) : null
  const bsa = bsaResult?.available ? Math.round(bsaResult.value.squareMetres * 100) / 100 : null
  const diagnoses = listOfLabels(p?.diagnosesJson).length > 0 ? listOfLabels(p?.diagnosesJson) : listOfLabels(p?.diagnosis)
  const procedures = listOfLabels(p?.proceduresJson).length > 0 ? listOfLabels(p?.proceduresJson) : listOfLabels(p?.plannedProcedure)

  const scores: string[] = []
  if (p?.asaScore) scores.push(`ASA ${p.asaScore}${p.emergencySurgery ? "E" : ""}`)
  if (p?.rcriScore != null) scores.push(`RCRI ${displayResearchScore("rcri", p.rcriScore, lang)}`)
  if (p?.apfelScore != null) scores.push(`Apfel ${displayResearchScore("apfel", p.apfelScore, lang)}`)
  if (p?.stopBangScore != null) scores.push(`STOP-BANG ${displayResearchScore("stopBang", p.stopBangScore, lang)}`)
  if (p?.povocScore != null) scores.push(`POVOC ${displayResearchScore("povoc", p.povocScore, lang)}`)
  if (p?.coldsScore != null) scores.push(`COLDS ${displayResearchScore("colds", p.coldsScore, lang)}`)

  const vitals = [
    p?.bpSystolic && p?.bpDiastolic ? `${L.bp} ${p.bpSystolic}/${p.bpDiastolic}` : null,
    p?.heartRate ? `${L.hr} ${p.heartRate}` : null,
    p?.respiratoryRate ? `${L.rr} ${p.respiratoryRate}` : null,
    p?.spO2 ? `SpO₂ ${p.spO2} %` : null,
    p?.temperature ? `${L.temp} ${p.temperature} °C` : null,
  ].filter(Boolean).join(" · ")

  // The case's own copy of each order, printed in the sheet's language.
  const wardOrders = Array.isArray(p?.preopWardOrders) ? p.preopWardOrders as PreopWardOrder[] : []
  const instructions = Array.isArray(p?.preopMedicationInstructions) ? p.preopMedicationInstructions as PreopMedicationInstruction[] : []
  const orders = {
    none: wardOrders.some(order => order.kind === "NONE"),
    consults: wardOrders.filter(order => order.kind === "CONSULT").map(order => (order.specialtyKey ? specialtyLabel(order.specialtyKey, lang) : null) ?? (lang === "bg" ? order.specialtyLabelBg : order.specialtyLabelEn) ?? ""),
    others: wardOrders.filter(order => order.kind !== "NONE" && order.kind !== "CONSULT").map(order => wardOrderText(order, lang)),
    all: wardOrders.map(order => wardOrderText(order, lang)),
  }
  const medicationOrders = {
    stop: instructions.filter(row => row.optionKey === "STOP_BEFORE_SURGERY").map(row => ({ drug: row.medicationLabel, hours: row.hoursBefore == null ? null : holdHoursText(row.hoursBefore, lang) })),
    keep: instructions.filter(row => row.optionKey === "DO_NOT_STOP").map(row => row.medicationLabel),
    others: instructions.filter(row => row.optionKey !== "STOP_BEFORE_SURGERY" && row.optionKey !== "DO_NOT_STOP").map(row => medicationInstructionText(row, lang)),
    all: instructions.map(row => medicationInstructionText(row, lang)),
  }

  // The premedication ordered for the ward to give, a phase each, drug names in the sheet's language.
  const premedOrders = (p?.preopPremedicationOrders ?? {}) as Record<string, string | null | undefined>
  const premedication = {
    night: premedicationEntries(premedOrders.DAY_BEFORE).map(entry => displayOptionEntry("PREMED_DRUG", entry, lang)),
    morning: premedicationEntries(premedOrders.MORNING).map(entry => displayOptionEntry("PREMED_DRUG", entry, lang)),
  }

  const consultant = personName(data.createdBy)
  const holder = personName(data.user)

  return {
    L,
    lang,
    p,
    zone,
    ageYears,
    ageText,
    broselow: broselowZone({ clinicalMode: data.clinicalMode ?? "ADULT", heightCm: p?.heightCm, weightKg: p?.weightKg }),
    child: ageYears != null && ageYears < CONSENT_PARENT_ONLY_BELOW_YEARS,
    bsa,
    bloodGroup: p?.bloodType ? `${p.bloodType}${p.rhFactor === "POSITIVE" ? " Rh+" : p.rhFactor === "NEGATIVE" ? " Rh−" : ""}` : null,
    diagnosisText: diagnoses.map(tag => [tag.code, tag.label].filter(Boolean).join(" ")).join("; "),
    procedureText: procedures.map(tag => tag.label).join("; "),
    urgencyText: p?.emergencySurgery ? L.emergency : p?.elective ? L.elective : null,
    comorbidities: listOfLabels(p?.comorbidities),
    medications: listOfLabels(p?.currentMedications),
    hasAllergy: p?.allergies === true || p?.latexAllergy === true,
    allergyLine: allergyLine(listOfLabels(p?.allergyDetails).map(tag => tag.label), p?.latexAllergy === true, L.latex),
    labs: (p?.labResults ?? []).filter(lab => lab?.value),
    fasting: p?.pediatricFasting ?? [],
    orders,
    medicationOrders,
    premedication,
    plannedText: plannedAnaesthesiaText(p?.plannedAnaesthesia, lang),
    scores,
    vitals,
    questionnaire: data.preopQuestionnaire ?? [],
    consultedAt: p?.updatedAt ? printGeneratedDate(new Date(p.updatedAt), locale, zone) : null,
    consultant,
    holder,
    handedOn: holder && holder !== consultant ? holder : null,
    printedText: printGeneratedDate(printedAt, locale, zone),
    institution: [data.institution?.name, data.institution?.city].filter(Boolean).join(" · "),
  }
}

export type SummaryFacts = ReturnType<typeof summaryFacts>
