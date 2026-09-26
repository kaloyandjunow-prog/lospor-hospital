// Pure DB-record ⇄ form-value mapping for the case wizard.
//
// Extracted from page.tsx so the mapping can be read — and tested — without a
// component around it. Nothing here touches React or component state; the
// wizard just calls it on load and on save.

import { hasDedicatedPreopControl } from "@lospor/core/preop-assessment"
import type { PreopData } from "@/components/forms/PreopForm"
import type { IntraopData } from "@/components/forms/IntraopForm"
import type { PostopData } from "@/components/forms/PostopForm"
import type { PreopSummary } from "@/components/forms/preop-summary"
import type { CaseDetailPreop, CaseDetailIntraop, CaseDetailPostop } from "@/types/case-detail"
import { calcBMI } from "@/lib/scores"
import { localTimeOf } from "@/lib/intraop-time"
import { plannedProcedureText } from "@lospor/core/procedure-codes"

type FormPreopAnswerState = "YES" | "NO" | "UNKNOWN" | "NOT_APPLICABLE"


// Convert Prisma DateTime -> HH:MM. DB values are stored in UTC (ref date 2000-01-01),
// so read UTC hours/minutes to recover the original local time the user entered.
/** A stored free-text column read through the DTO's index signature. */
function storedText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function isoToHHMM(iso: unknown): string | undefined {
  if (!iso) return undefined
  if (typeof iso === "string" && /^\d{2}:\d{2}$/.test(iso)) return iso
  if (typeof iso !== "string" && typeof iso !== "number" && !(iso instanceof Date)) return undefined
  try {
    const d = new Date(iso)
    if (!isNaN(d.getTime())) return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`
  } catch {}
  return undefined
}

// Convert flat DB preop record -> PreopForm defaultValues shape.
//
// Every field in the PreopForm schema must appear here. A field that is
// editable and persisted but missing from this map comes back blank when the
// case is reopened, and the next autosave writes that blank over the stored
// answer — silently, with no error anywhere. `page.test.tsx` walks the form
// schema and fails on the first field this map forgets.
//
// DB-only columns stay stripped: id, caseId, bmi, gutaScore, povocScore,
// coldsScore, ageApproxDays, createdAt, updatedAt, syncRevision — all of them
// computed or metadata, none of them typed by the clinician.
export function dbPreopToForm(
  p: CaseDetailPreop,
  caseClinicalMode: PreopData["clinicalMode"] = "ADULT",
): Partial<PreopData> {
  // Comma-joined fields (allergyDetails, currentMedications)
  const toTags = (str: string | null | undefined) => {
    if (!str) return []
    const trimmed = str.trim()
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return parsed
      } catch {}
    }
    return str.split(",").map(s => s.trim()).filter(Boolean).map(label => ({ label }))
  }
  const triState = (value: unknown): boolean | null =>
    typeof value === "boolean" ? value : null
  // Semicolon-joined fields - diagnoses/procedure names can contain commas
  const toTagsSemi = (json: unknown, str: string | null | undefined) => {
    if (Array.isArray(json) && json.length > 0) return json as { label: string; sub?: string }[]
    return str ? str.split(";").map(s => s.trim()).filter(Boolean).map(label => ({ label })) : []
  }
  const formAnswerState = (value: unknown): FormPreopAnswerState | null => {
    return value === "YES" || value === "NO" || value === "UNKNOWN" || value === "NOT_APPLICABLE"
      ? value
      : null
  }

  return {
    // Demographics
    clinicalMode:          caseClinicalMode ?? "ADULT",
    ageYears:              p.ageYears              ?? undefined,
    ageValue:              p.ageValue              ?? undefined,
    ageUnit:               p.ageUnit               ?? undefined,
    sex:                   p.sex                   ?? undefined,
    heightCm:              p.heightCm              ?? undefined,
    weightKg:              p.weightKg              ?? undefined,
    bloodType:             p.bloodType             ?? undefined,
    rhFactor:              p.rhFactor              ?? undefined,

    // Case - prefer JSON arrays; fall back to semicolon-split string (never comma-split)
    diagnoses:          toTagsSemi(p.diagnosesJson, p.diagnosis),
    procedures:         toTagsSemi(p.proceduresJson, p.plannedProcedure),
    teamNotes:            p.teamNotes            ?? undefined,
    highRiskSurgery:      p.highRiskSurgery      ?? false,
    elective:             p.elective              ?? false,
    emergencySurgery:     p.emergencySurgery      ?? false,
    aiOptIn:              p.aiOptIn               ?? false,
    preopAnswers: Array.isArray(p.assessmentAnswers) ? p.assessmentAnswers.map(answer => {
      const objectAnswer = typeof answer === "object" && answer !== null ? answer as {
        question?: { stableKey?: unknown }
        state?: unknown
        optionKey?: string | null
        valueText?: string | null
        valueNumber?: number | null
        valueDate?: string | Date | null
      } : null
      return {
        stableKey: objectAnswer ? String(objectAnswer.question?.stableKey ?? "") : "",
        state: formAnswerState(objectAnswer?.state),
        optionKey: objectAnswer?.optionKey ?? null,
        valueText: objectAnswer?.valueText ?? null,
        valueNumber: objectAnswer?.valueNumber ?? null,
        valueDate: objectAnswer?.valueDate ? new Date(objectAnswer.valueDate).toISOString() : null,
      }
    }).filter((answer): answer is typeof answer & { state: FormPreopAnswerState } =>
      // Baseline questions are answered through their own fields; a copy here
      // would be stale the moment the toggle changes (the server ignores it).
      answer.stableKey.length > 0 && answer.state !== null && !hasDedicatedPreopControl(answer.stableKey),
    ) : [],

    // Medical history
    comorbidities: Array.isArray(p.comorbidities)
      ? p.comorbidities.map(c => typeof c === "string" ? { label: c } : c)
      : [],

    // Safety
    allergies:                p.allergies                ?? null,
    allergyDetails:           toTags(p.allergyDetails),
    latexAllergy:             p.latexAllergy             ?? null,
    currentMedications:       toTags(p.currentMedications),
    familyAnesthesiaProblems: p.familyAnesthesiaProblems ?? null,
    familyAnesthesiaDetails:  p.familyAnesthesiaDetails  ?? undefined,
    // Read through the DTO's index signature rather than a declared property:
    // the published @lospor/core does not name these two yet, so they arrive
    // typed as unknown. triState keeps the third state intact — anything that
    // is not a real boolean is "not asked", never a fabricated "no".
    unexplainedAnaesthesiaComplications: triState(p.unexplainedAnaesthesiaComplications),
    malignantHyperthermiaHistory:        triState(p.malignantHyperthermiaHistory),
    dentalProsthetics:        p.dentalProsthetics        ?? null,
    looseTeeth:               p.looseTeeth               ?? null,
    smoking:                  p.smoking                  ?? null,
    substanceAbuse:           p.substanceAbuse           ?? null,

    // Vitals
    bpSystolic:      p.bpSystolic      ?? undefined,
    bpDiastolic:     p.bpDiastolic     ?? undefined,
    heartRate:       p.heartRate       ?? undefined,
    heartArrhythmia: p.heartArrhythmia ?? null,
    spO2:            p.spO2            ?? undefined,
    temperature:     p.temperature     ?? undefined,
    respiratoryRate: p.respiratoryRate ?? undefined,

    // "Unable to obtain" flags — a recorded refusal to record. Dropping them
    // turned a deliberate "could not measure" back into "not asked yet".
    bpUnobtainable:              p.bpUnobtainable              ?? false,
    heartRateUnobtainable:       p.heartRateUnobtainable       ?? false,
    spO2Unobtainable:            p.spO2Unobtainable            ?? false,
    temperatureUnobtainable:     p.temperatureUnobtainable     ?? false,
    respiratoryRateUnobtainable: p.respiratoryRateUnobtainable ?? false,

    // Airway
    mallampati:             p.mallampati             ?? undefined,
    mouthOpeningCm:         p.mouthOpeningCm         ?? undefined,
    thyromental:            p.thyromental            ?? undefined,
    neckMobility:           p.neckMobility           ?? undefined,
    upperLipBiteTest:       p.upperLipBiteTest       ?? undefined,
    retrognathia:           p.retrognathia           ?? null,
    prominentIncisors:      p.prominentIncisors      ?? null,
    facialHair:             p.facialHair             ?? null,
    difficultAirwayHistory: p.difficultAirwayHistory ?? null,
    anticipatedDifficultAirway: triState(p.anticipatedDifficultAirway),
    difficultAirwayNotes:   p.difficultAirwayNotes   ?? undefined,
    cormackLehane:          p.cormackLehane          ?? undefined,
    airwayUnobtainable:     p.airwayUnobtainable     ?? false,

    // Scores. The individual inputs are what the clinician ticked; the
    // totals are recomputed from them on submit, but they are restored too
    // so a reopened case reads the same before anything is touched.
    asaScore:                       p.asaScore                       ?? undefined,
    apfelPONVHistory:               p.apfelPONVHistory               ?? null,
    apfelPostopOpioids:             p.apfelPostopOpioids             ?? null,
    stopbangSnoring:                p.stopbangSnoring                ?? null,
    stopbangTired:                  p.stopbangTired                  ?? null,
    stopbangObserved:               p.stopbangObserved               ?? null,
    stopbangBP:                     p.stopbangBP                     ?? null,
    stopbangNeck:                   p.stopbangNeck                   ?? null,
    rcriIschemicHeart:              p.rcriIschemicHeart              ?? null,
    rcriCHF:                        p.rcriCHF                        ?? null,
    rcriCVD:                        p.rcriCVD                        ?? null,
    rcriInsulinDM:                  p.rcriInsulinDM                  ?? null,
    rcriCreatinine:                 p.rcriCreatinine                 ?? null,
    rcriScore:                      p.rcriScore                      ?? undefined,
    apfelScore:                     p.apfelScore                     ?? undefined,
    stopBangScore:                  p.stopBangScore                  ?? undefined,
    povocSurgeryAtLeast30Minutes:   p.povocSurgeryAtLeast30Minutes  ?? null,
    povocStrabismusSurgery:         p.povocStrabismusSurgery        ?? null,
    povocHistory:                   p.povocHistory                   ?? null,
    coldsApplicable:                p.coldsApplicable                ?? false,
    coldsCurrentSymptoms:           p.coldsCurrentSymptoms           as PreopData["coldsCurrentSymptoms"],
    coldsOnset:                     p.coldsOnset                     as PreopData["coldsOnset"],
    coldsLungDisease:               p.coldsLungDisease               as PreopData["coldsLungDisease"],
    coldsAirwayDevice:              p.coldsAirwayDevice              as PreopData["coldsAirwayDevice"],
    coldsSurgery:                   p.coldsSurgery                   as PreopData["coldsSurgery"],
    pediatricFasting: Array.isArray(p.pediatricFasting)
      ? p.pediatricFasting.map(row => ({
          ...row,
          status: row.status ?? "UNKNOWN",
        })) as PreopData["pediatricFasting"]
      : [],

    // Free text. Both are stored columns that the shared CaseDetailPreop DTO
    // does not spell out, so they arrive through its index signature.
    physicalExamReport: storedText(p.physicalExamReport),
    notes:              storedText(p.notes),

    labResults: Array.isArray(p.labResults) ? p.labResults : [],

    // Patient fields (never saved to DB - intentionally left empty for GDPR)
    patientFirstName: undefined,
    patientLastName:  undefined,
    patientId:        undefined,
  }
}

export function dbPostopToForm(o: CaseDetailPostop): PostopData {
  return {
    aldreteActivity:      o.aldreteActivity      ?? undefined,
    aldreteRespiration:   o.aldreteRespiration   ?? undefined,
    aldreteCirculation:   o.aldreteCirculation   ?? undefined,
    aldreteConsciousness: o.aldreteConsciousness ?? undefined,
    aldreteSpO2:          o.aldreteSpO2          ?? undefined,
    painScoreNRS:         o.painScoreNRS         ?? undefined,
    pediatricPainScale:   o.pediatricPainScale   ?? undefined,
    pediatricPainScore:   o.pediatricPainScore   ?? undefined,
    paedScore:            o.paedScore            ?? undefined,
    ponv:                 o.ponv                 ?? null,
    temperatureCelsius:   o.temperatureCelsius   ?? undefined,
    recoveryBpSystolic:   o.recoveryBpSystolic   ?? undefined,
    recoveryBpDiastolic:  o.recoveryBpDiastolic  ?? undefined,
    recoveryHeartRate:    o.recoveryHeartRate    ?? undefined,
    recoverySpO2:         o.recoverySpO2         ?? undefined,
    recoveryBpUnobtainable:          o.recoveryBpUnobtainable          ?? false,
    recoveryHeartRateUnobtainable:   o.recoveryHeartRateUnobtainable   ?? false,
    recoverySpO2Unobtainable:        o.recoverySpO2Unobtainable        ?? false,
    recoveryTemperatureUnobtainable: o.recoveryTemperatureUnobtainable ?? false,
    disposition:          o.disposition          ?? undefined,
    dispositionNotes:     o.dispositionNotes     ?? undefined,
    handoverItems:        Array.isArray(o.handoverItems) ? o.handoverItems : [],
  }
}

export function dbIntraopToForm(intraop: CaseDetailIntraop): Partial<IntraopData> {
  // Strip DB-only fields that don't belong in the form and would cause autosave
  // ZodErrors: keyEvents is a TimetableData object but intraopSchema expects an array;
  // id/caseId/createdAt/updatedAt are DB metadata; timeSeriesData/durationMinutes are computed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, caseId, createdAt, updatedAt, keyEvents, timeSeriesData, durationMinutes, autoEndedAt, ...formFields } = intraop
  const endTimeNextDay = !!(intraop.endTime && intraop.startTime &&
    new Date(intraop.endTime).getTime() - new Date(intraop.startTime).getTime() > 12 * 60 * 60 * 1000)

  // Prefer the real instants, rendered in the zone the case was charted in —
  // so a case reads the same wall clock wherever it is later opened. Legacy
  // rows fall back to their bare stored wall clock.
  const tz = intraop.timezone ?? null
  const startFromInstant = intraop.startedAt && tz
    ? localTimeOf(new Date(intraop.startedAt), tz) ?? undefined : undefined
  const endFromInstant = intraop.endedAt && tz
    ? localTimeOf(new Date(intraop.endedAt), tz) ?? undefined : undefined

  return {
    // JSON-blob fields (positions, techniques, airwayDevices, etc.) are
    // unknown on CaseDetailIntraop - genuinely loosely shaped at the DB
    // level - but always arrays/scalars matching IntraopData's shape in
    // practice, at the same boundary as the rest of this file's DB-to-form mapping.
    ...(formFields as unknown as Partial<IntraopData>),
    monthYear:      intraop.monthYear ?? undefined,
    startTime:      startFromInstant ?? isoToHHMM(intraop.startTime),
    endTime:        endFromInstant ?? (intraop.endTime ? isoToHHMM(intraop.endTime) : undefined),
    endTimeNextDay,
  }
}

// The clinical-context slice of preop that IntraopForm reads for its own
// decisions (dosing, airway warnings). Kept alongside the other DB/form
// mappings so IntraopForm's prop shape and PreopForm's field names cannot
// drift apart unnoticed.
export function preopSummaryForIntraop(preop: PreopData): PreopSummary {
  return {
    clinicalMode:           preop.clinicalMode,
    asaScore:              preop.asaScore,
    ageYears:              preop.ageYears,
    ageValue:              preop.ageValue,
    ageUnit:               preop.ageUnit,
    heightCm:              preop.heightCm,
    weightKg:              preop.weightKg,
    sex:                   preop.sex,
    bmi:                   preop.heightCm && preop.weightKg ? Math.round(preop.weightKg / ((preop.heightCm / 100) ** 2) * 10) / 10 : undefined,
    bpSystolic:            preop.bpSystolic,
    bpDiastolic:           preop.bpDiastolic,
    heartRate:             preop.heartRate,
    spO2:                  preop.spO2,
    mallampati:            preop.mallampati,
    neckMobility:          preop.neckMobility,
    mouthOpeningCm:        preop.mouthOpeningCm,
    cormackLehane:         preop.cormackLehane,
    difficultAirwayHistory: preop.difficultAirwayHistory,
    allergies:             preop.allergies,
    allergyDetails:        preop.allergyDetails,
    comorbidities:         preop.comorbidities,
    currentMedications:    preop.currentMedications,
    labResults:            preop.labResults,
    diagnosis:             preop.diagnoses?.map(d => d.label).join("; ") || null,
    plannedProcedure:      plannedProcedureText(preop.procedures) || null,
    emergencySurgery:      preop.emergencySurgery ?? null,
  }
}

export function sectionPayload(
  section: "preop" | "intraop" | "postop",
  data: PreopData | IntraopData | PostopData,
): Record<string, unknown> {
  if (section === "preop") {
    const preop = data as PreopData
    const bmi = preop.heightCm && preop.weightKg ? calcBMI(preop.heightCm, preop.weightKg) : undefined
    // APPLIANCE-LOCAL, carried across the 9.0.1 re-vendor.
    //
    // Upstream does not need this: on the hosted app the patient fields are
    // never populated, so there is nothing to strip. This box is different — it
    // holds real identifiers, linked to a case through its own identity path.
    // They must not travel inside the clinical payload as well, or the same
    // name ends up in two places with only one of them governed.
    //
    // Upstream blanks these on the way in (dbPreopToForm above). This is the
    // way out, and it is the direction that would persist them.
    const clinicalPreop = { ...preop } as Record<string, unknown>
    delete clinicalPreop.patientFirstName
    delete clinicalPreop.patientLastName
    delete clinicalPreop.patientId
    return { ...clinicalPreop, bmi }
  }
  if (section === "intraop") {
    const intraop = data as IntraopData
    return {
      ...intraop,
      timezone: intraop.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  }
  return data as Record<string, unknown>
}
