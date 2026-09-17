import { useMemo } from "react"
import { calcApfel, calcRCRI, calcStopBang } from "@/lib/scores"
import {
  suggestRcriIschemicHeart,
  suggestRcriCHF,
  suggestRcriCVD,
  suggestRcriInsulinDM,
  suggestRcriCreatinine,
  suggestStopBangBP,
} from "@/lib/risk-derivation"

function answered(values: Array<boolean | null | undefined>) {
  return values.filter(value => value != null).length
}

/**
 * RCRI/Apfel/STOP-Bang suggestions and scores, plus how much of each score
 * was actually answered — an unasked criterion counts as absent in the score
 * itself (deliberate), but the card must say so rather than showing "low" for
 * a score nobody actually answered.
 */
export function usePreopRiskScores(input: {
  comorbidities: { label: string }[] | undefined
  currentMedications: { label: string; atcCode?: string }[] | undefined
  labResults: { test: string; value: string; unit: string }[] | undefined
  sex: string | undefined
  smoking: boolean | null | undefined
  bmi: number | null
  ageYearsVal: number | null | undefined
  highRiskSurgery: boolean | null | undefined
  apfelPONVHistory: boolean | null | undefined
  apfelPostopOpioids: boolean | null | undefined
  stopbangSnoring: boolean | null | undefined
  stopbangTired: boolean | null | undefined
  stopbangObserved: boolean | null | undefined
  stopbangBP: boolean | null | undefined
  stopbangNeck: boolean | null | undefined
  rcriIschemicHeart: boolean | null | undefined
  rcriCHF: boolean | null | undefined
  rcriCVD: boolean | null | undefined
  rcriInsulinDM: boolean | null | undefined
  rcriCreatinine: boolean | null | undefined
}) {
  const {
    comorbidities, currentMedications, labResults, sex, smoking, bmi, ageYearsVal, highRiskSurgery,
    apfelPONVHistory, apfelPostopOpioids, stopbangSnoring, stopbangTired, stopbangObserved, stopbangBP, stopbangNeck,
    rcriIschemicHeart, rcriCHF, rcriCVD, rcriInsulinDM, rcriCreatinine,
  } = input

  // Suggestions only — never silently auto-checked.
  const rcriSuggested = useMemo(() => ({
    rcriIschemicHeart: suggestRcriIschemicHeart(comorbidities ?? []),
    rcriCHF:            suggestRcriCHF(comorbidities ?? []),
    rcriCVD:            suggestRcriCVD(comorbidities ?? []),
    rcriInsulinDM:      suggestRcriInsulinDM(comorbidities ?? [], currentMedications ?? []),
    rcriCreatinine:     suggestRcriCreatinine(labResults ?? []),
  }), [comorbidities, currentMedications, labResults])
  const stopBangBPSuggested = useMemo(() => suggestStopBangBP(comorbidities ?? [], currentMedications ?? []), [comorbidities, currentMedications])

  const apfelScore = useMemo(() => calcApfel({
    female:         sex === "FEMALE",
    // Answered `false` only -- `!smoking` mapped an unanswered `null` to `true`.
    nonSmoker:      smoking === false,
    ponvHistory:    apfelPONVHistory  ?? false,
    opioidsPlanned: apfelPostopOpioids ?? false,
  }), [sex, smoking, apfelPONVHistory, apfelPostopOpioids])

  const stopBangScore = useMemo(() => calcStopBang({
    snoring:      stopbangSnoring  ?? false,
    tired:        stopbangTired    ?? false,
    observed:     stopbangObserved ?? false,
    highBP:       stopbangBP       ?? false,
    bmi:          bmi ?? 0,
    ageOver50:    (ageYearsVal ?? 0) > 50,
    neckOver40cm: stopbangNeck    ?? false,
    male:         sex === "MALE",
  }), [stopbangSnoring, stopbangTired, stopbangObserved, stopbangBP, bmi, ageYearsVal, stopbangNeck, sex])

  const rcriAnswered = useMemo(() => answered([
    rcriIschemicHeart, rcriCHF, rcriCVD, rcriInsulinDM, rcriCreatinine,
  ]), [rcriIschemicHeart, rcriCHF, rcriCVD, rcriInsulinDM, rcriCreatinine])
  const apfelAnswered = useMemo(() => answered([
    smoking, apfelPONVHistory, apfelPostopOpioids,
  ]), [smoking, apfelPONVHistory, apfelPostopOpioids])
  const stopBangAnswered = useMemo(() => answered([
    stopbangSnoring, stopbangTired, stopbangObserved, stopbangBP, stopbangNeck,
  ]), [stopbangSnoring, stopbangTired, stopbangObserved, stopbangBP, stopbangNeck])

  const rcriScore = useMemo(() => calcRCRI({
    highRiskSurgery:          highRiskSurgery   ?? false,
    ischaemicHeartDisease:    rcriIschemicHeart ?? false,
    congestiveHeartFailure:   rcriCHF           ?? false,
    cerebrovascularDisease:   rcriCVD           ?? false,
    insulinDependentDiabetes: rcriInsulinDM     ?? false,
    creatinineHigh:           rcriCreatinine    ?? false,
  }), [highRiskSurgery, rcriIschemicHeart, rcriCHF, rcriCVD, rcriInsulinDM, rcriCreatinine])

  return {
    rcriSuggested, stopBangBPSuggested, apfelScore, stopBangScore,
    rcriAnswered, apfelAnswered, stopBangAnswered, rcriScore,
  }
}
