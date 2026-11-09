import { preopAgeDays } from "../vital-questions"
import type { SuggestionPatient, SuggestionPreop } from "./context"

/**
 * What the suggestions (10.2.0) read from the preoperative record, worked out
 * once here so the PWA and the web app read the same record the same way.
 * Every fact is a yes only on a recorded yes: an unanswered question is not
 * a history of anything.
 */

type Tag = { label?: string | null; sub?: string | null; code?: string | null; icd10Code?: string | null; atcCode?: string | null }

export type SuggestionPreopRecord = {
  ageValue?: number | null
  ageUnit?: string | null
  ageYears?: number | null
  ageApproxDays?: number | null
  weightKg?: number | null
  sex?: string | null
  malignantHyperthermiaHistory?: boolean | null
  familyAnesthesiaProblems?: boolean | null
  latexAllergy?: boolean | null
  apfelScore?: number | null
  apfelPONVHistory?: boolean | null
  comorbidities?: readonly Tag[] | null
  currentMedications?: readonly Tag[] | null
}

const textOf = (tag: Tag) => `${tag.label ?? ""} ${tag.sub ?? ""}`
const codeOf = (tag: Tag) => (tag.icd10Code ?? tag.code ?? "").toUpperCase().replace(/\s+/g, "")

/** Diabetes mellitus: ICD-10 E10-E14, or named. */
const DIABETES = /diabet|диабет|захарн/i
const isDiabetes = (tag: Tag) => /^E1[0-4]/.test(codeOf(tag)) || DIABETES.test(textOf(tag))

/**
 * Cyanotic heart disease: the lesions that leave a child blue (tetralogy,
 * transposition, single ventricle, tricuspid and pulmonary atresia, Ebstein,
 * hypoplastic left heart, total anomalous pulmonary venous return), or named.
 */
const CYANOTIC_CODES = /^(Q20\.[0-4]|Q21\.3|Q22\.[0456]|Q23\.4|Q26\.2)/
const CYANOTIC = /cyano|цианот|fallot|фало|eisenmenger|айзенменгер/i
const isCyanotic = (tag: Tag) => CYANOTIC_CODES.test(codeOf(tag)) || CYANOTIC.test(textOf(tag))

/** A beta-blocker: ATC C07, or an -olol / -alol / -ilol name. */
const BETA_BLOCKER_NAME = /\b\w+(olol|alol|ilol)\b/i
const isBetaBlocker = (tag: Tag) => (tag.atcCode ?? "").toUpperCase().startsWith("C07") || BETA_BLOCKER_NAME.test(tag.label ?? "")

const SEXES = new Set(["MALE", "FEMALE"])

export function suggestionFactsFromPreop(
  record: SuggestionPreopRecord | null | undefined,
  /** Ideal body weight, when the screen could work it out (local anaesthetic maximum, LAST). */
  idealWeightKg?: number | null,
): { patient: SuggestionPatient; preop: SuggestionPreop } {
  const comorbidities = record?.comorbidities ?? []
  const medications = record?.currentMedications ?? []
  const weight = record?.weightKg
  return {
    patient: {
      ageDays: preopAgeDays(record ?? null),
      weightKg: typeof weight === "number" && weight > 0 ? weight : null,
      idealWeightKg: typeof idealWeightKg === "number" && idealWeightKg > 0 ? idealWeightKg : null,
      sex: record?.sex && SEXES.has(record.sex) ? record.sex as "MALE" | "FEMALE" : null,
    },
    preop: {
      // P1 asks about the patient's own history and the family's anaesthetic problems.
      mhHistory: record?.malignantHyperthermiaHistory === true || record?.familyAnesthesiaProblems === true,
      latexAllergy: record?.latexAllergy === true,
      diabetes: comorbidities.some(isDiabetes),
      apfelScore: typeof record?.apfelScore === "number" ? record.apfelScore : null,
      ponvHistory: record?.apfelPONVHistory === true,
      betaBlocker: medications.some(isBetaBlocker),
      cyanoticHeartDisease: comorbidities.some(isCyanotic),
    },
  }
}
