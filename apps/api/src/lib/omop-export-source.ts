import type { Prisma } from "@/generated/prisma/client"
import { deepRedactPII, redactText } from "@/lib/pii-check"

type ExportRow = Prisma.CaseGetPayload<{ select: typeof CASE_SELECT }>

// Redacts the free-text fields this export actually selects ??? scalar String
// fields a clinician can type into directly, plus the freeform keyEvents
// JSON blob and each CaseEvent's label/value. Coded fields (comorbidities,
// diagnosesJson, proceduresJson, labRows) are left untouched: they're
// structured vocabulary entries, and blanket-redacting them would corrupt
// legitimate two-word diagnosis/institution labels via the name-pattern check.
export type ExportRedactionOptions = {
  /**
   * Whether redacted free text leaves at all.
   *
   * The export policy has offered this to administrators since 1.0.0, storing
   * and audit-logging the answer while nothing read it: free text was redacted
   * and sent regardless. An administrator could switch it off and watch the
   * setting save, and the text still left. A governance control that reports
   * success and changes nothing is worse than not offering one.
   *
   * True keeps the existing behaviour -- the text leaves, redacted. False drops
   * the free-text fields entirely, which is the stricter reading of the name
   * and the only one an administrator turning it off could reasonably want.
   * Coded fields are untouched either way; they are vocabulary entries, not
   * prose, and dropping them would empty the export of its clinical content.
   */
  includeRedactedText?: boolean
}

export function redactExportRow(c: ExportRow, options: ExportRedactionOptions = {}) {
  const includeText = options.includeRedactedText ?? true
  // Redacted when the text may leave, dropped when it may not.
  const text = <T extends string | null | undefined>(value: T): T | null => {
    if (!includeText) return null
    return value ? (redactText(value) as T) : value
  }
  // The same, for the fields the mapper types as non-nullable strings. They
  // cannot be dropped to null without changing the row's shape, so they are
  // emptied instead; either way no clinician-typed prose leaves.
  const requiredText = (value: string): string =>
    includeText ? redactText(value) : ""

  return {
    ...c,
    preop: c.preop ? {
      ...c.preop,
      diagnosis: requiredText(c.preop.diagnosis),
      plannedProcedure: requiredText(c.preop.plannedProcedure),
      allergyDetails: text(c.preop.allergyDetails),
      currentMedications: text(c.preop.currentMedications),
      // Free prose written by a clinician, so it goes through the same
      // redaction as every other note before it can leave.
      familyAnesthesiaDetails: text(c.preop.familyAnesthesiaDetails),
      difficultAirwayNotes: text(c.preop.difficultAirwayNotes),
      medications: c.preop.medications.map(row => ({
        ...row,
        nameRaw: requiredText(row.nameRaw),
      })),
    } : c.preop,
    events: (c.events ?? []).map(e => ({
      ...e,
      label: text(e.label),
      value: text(e.value),
    })),
    complications: (c.complications ?? []).map(comp => ({
      ...comp,
      note: text(comp.note),
    })),
    intraop: c.intraop ? {
      ...c.intraop,
      complications: text(c.intraop.complications),
      premedicationEvening: text(c.intraop.premedicationEvening),
      premedicationMorning: text(c.intraop.premedicationMorning),
      // The freeform timetable blob. Dropping it entirely would take the
      // structured intraoperative record with it, so when text may not leave it
      // is emptied rather than removed.
      keyEvents: includeText ? deepRedactPII(c.intraop.keyEvents) : {},
      premedicationRows: c.intraop.premedicationRows.map(row => ({
        ...row,
        nameRaw: requiredText(row.nameRaw),
      })),
    } : c.intraop,
  }
}

export const CASE_SELECT = {
  id: true, caseCode: true, createdAt: true, status: true, clinicalMode: true, clinicalRulesVersion: true,
  institutionId: true,
  patientLink: { select: { identifierHash: true, institutionId: true } },
  centralExportControl: { select: { decision: true, reasonCode: true } },
  centralExportCheckpoint: {
    select: {
      lastAction: true, clinicalRevision: true, eventRevision: true,
      relationalRevision: true, preopRevision: true, intraopRevision: true,
      postopRevision: true, acceptedAt: true,
    },
  },
  centralExportRejection: {
    select: {
      clinicalRevision: true, eventRevision: true, relationalRevision: true,
      preopRevision: true, intraopRevision: true, postopRevision: true,
      errorCode: true, rejectedAt: true,
    },
  },
  user: { select: { institution: { select: { name: true } } } },
  fieldStatuses: {
    select: { section: true, fieldKey: true, presence: true },
  },
  selections: {
    select: { section: true, category: true, value: true, ordinal: true, sourceVocabulary: true, sourceCode: true, standardConceptId: true, mappingStatus: true },
    orderBy: [{ section: "asc" }, { category: "asc" }, { ordinal: "asc" }],
  },
  complications: {
    select: { section: true, label: true, note: true, timestamp: true, source: true, ordinal: true, sourceVocabulary: true, sourceCode: true, standardConceptId: true, mappingStatus: true },
    orderBy: [{ section: "asc" }, { ordinal: "asc" }],
  },
  events: {
    where: { status: "active" },
    select: {
      type: true,
      timestamp: true,
      label: true,
      value: true,
      unit: true,
      systolic: true,
      diastolic: true,
      heartRate: true,
      spO2: true,
      etco2: true,
      temp: true,
      bgl: true,
      bglLoincCode: true,
      bglUnitCanon: true,
      fgfLitersPerMin: true,
      carrierGas: true,
      fio2Percent: true,
      fiAirPercent: true,
      fiN2OPercent: true,
      atcCode: true,
      drugId: true,
      inn: true,
      drugRoute: true,
      standardConceptId: true,
      mappingStatus: true,
      rate: true,
      concentration: true,
      concentrationValue: true,
      concentrationUnit: true,
      formulation: true,
      calculationBasis: true,
      calculationWeightKg: true,
      calculationMethod: true,
      clinicalRuleKey: true,
      clinicalRuleVersion: true,
      clinicalRuleSourceIds: true,
      clinicalPresetId: true,
      clinicalPresetVersion: true,
      clinicalPresetScope: true,
      infId: true,
      fluidId: true,
      volume: true,
      fluidCategory: true,
      agentPercent: true,
      clinicalEventCode: true,
      metadataJson: true,
    },
  },
  preop: {
    select: {
      syncRevision: true,
      ageYears: true, ageValue: true, ageUnit: true, ageApproxDays: true,
      sex: true, heightCm: true, weightKg: true, bodySurfaceAreaM2: true,
      bpSystolic: true, bpDiastolic: true, heartRate: true, spO2: true,
      temperature: true, respiratoryRate: true,
      diagnosis: true, diagnosesJson: true, plannedProcedure: true, proceduresJson: true,
      comorbidities: true, asaScore: true, emergencySurgery: true, highRiskSurgery: true,
      allergies: true, allergyDetails: true, smoking: true, substanceAbuse: true,
      // Clinical detail that was read into the mapper's row types but never
      // written to any table, so it left the appliance nowhere.
      bmi: true, bloodType: true, rhFactor: true, gutaScore: true,
      latexAllergy: true, familyAnesthesiaProblems: true, familyAnesthesiaDetails: true,
      dentalProsthetics: true, looseTeeth: true, heartArrhythmia: true,
      // The airway examination, as distinct from the difficult-airway history.
      mouthOpeningCm: true, thyromental: true, neckMobility: true, upperLipBiteTest: true,
      retrognathia: true, prominentIncisors: true, facialHair: true,
      difficultAirwayNotes: true,
      currentMedications: true, rcriScore: true, apfelScore: true, stopBangScore: true,
      povocScore: true, povocRiskPercent: true, coldsScore: true, pediatricFasting: true,
      difficultAirwayHistory: true, mallampati: true, labResults: true,
      labRows: {
        select: {
          test: true, valueNum: true, value: true, unitCanon: true, loincCode: true, abnormalFlag: true,
          // A result the lab reported as text, and the range it was judged
          // against. Without the range, "high" is an assertion the export
          // cannot support; without the text, a qualitative result vanished.
          referenceLow: true, referenceHigh: true,
          standardConceptId: true, mappingStatus: true,
        },
      },
      diagnoses: {
        select: {
          code: true, label: true, labelEn: true, labelBg: true,
          sourceVocabulary: true, sourceCode: true, standardConceptId: true, mappingStatus: true, ordinal: true,
        },
        orderBy: { ordinal: "asc" },
      },
      procedureRows: {
        select: {
          code: true, group: true, domain: true, description: true,
          sourceVocabulary: true, sourceCode: true, standardConceptId: true, mappingStatus: true, ordinal: true,
        },
        orderBy: { ordinal: "asc" },
      },
      comorbidityRows: {
        select: {
          label: true, labelEn: true, labelBg: true, code: true, icd10Code: true,
          sourceVocabulary: true, sourceCode: true, standardConceptId: true, mappingStatus: true, ordinal: true,
        },
        orderBy: { ordinal: "asc" },
      },
      medications: {
        select: {
          kind: true, nameRaw: true, inn: true, atcCode: true, dose: true, route: true,
          sourceVocabulary: true, sourceCode: true, standardConceptId: true, mappingStatus: true, ordinal: true,
        },
        orderBy: [{ kind: "asc" }, { ordinal: "asc" }],
      },
    },
  },
  intraop: {
    select: {
      syncRevision: true,
      startedAt: true, endedAt: true, timezone: true,
      startTime: true, endTime: true, durationMinutes: true, monthYear: true,
      techniques: true, keyEvents: true, airwayDevice: true,
      // Airway management detail. None of this used to leave the appliance, so
      // an export could say a tube was placed but never which one, what size,
      // whether it was cuffed, or how hard the laryngoscopy was -- the part a
      // difficult-airway study is actually about.
      airwayDevices: true, cormackLehane: true, airwayTools: true, fob: true,
      lmaSize: true,
      oralTubeSize: true, oralCuffed: true, nasalTubeSize: true, nasalCuffed: true,
      dltType: true, dltSide: true, dltSize: true, endobronchialSize: true,
      // Legacy single-device columns, still the only size on older rows.
      tubeSize: true, cuffed: true,
      ventilationModes: true, ippv: true, jetVentilation: true, peepCmH2O: true,
      crystalloidsMl: true, colloidsMl: true, bloodMl: true, urineMl: true,
      complications: true, premedicationEvening: true, premedicationMorning: true,
      vascularAccessRows: {
        select: { site: true, siteLabel: true, size: true, sizeUnit: true, depthCm: true, lumens: true, preexisting: true, ordinal: true, sourceVocabulary: true, sourceCode: true, standardConceptId: true, mappingStatus: true },
        orderBy: { ordinal: "asc" },
      },
      premedicationRows: {
        select: {
          phase: true, nameRaw: true, inn: true, atcCode: true, dose: true, route: true,
          sourceVocabulary: true, sourceCode: true, standardConceptId: true, mappingStatus: true, ordinal: true,
        },
        orderBy: [{ phase: "asc" }, { ordinal: "asc" }],
      },
    },
  },
  postop: {
    select: {
      syncRevision: true,
      aldreteActivity: true, aldreteRespiration: true, aldreteCirculation: true, aldreteConsciousness: true, aldreteSpO2: true,
      aldreteTotal: true, painScoreNRS: true, pediatricPainScale: true,
      pediatricPainScore: true, paedScore: true, ponv: true, disposition: true,
      recoveryBpSystolic: true, recoveryBpDiastolic: true, recoveryHeartRate: true, recoverySpO2: true, temperatureCelsius: true,
      complications: true,
    },
  },
  snapshot:    { select: { id: true } },
  clinicalRevision: true,
  eventRevision: true,
  relationalRevision: true,
  updatedAt:   true,
  finalizedAt: true,
} satisfies Prisma.CaseSelect
