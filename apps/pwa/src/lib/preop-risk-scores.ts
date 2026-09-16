import { calcApfel, calcRCRI, calcStopBang } from "@lospor/core/scores"
import {
  suggestRcriIschemicHeart,
  suggestRcriCHF,
  suggestRcriCVD,
  suggestRcriInsulinDM,
  suggestRcriCreatinine,
  suggestStopBangBP,
} from "@/lib/risk-derivation"

/**
 * RCRI/Apfel/STOP-Bang suggestions and scores from the preop form's watched
 * values. A plain function, not a hook — same reasoning as
 * convertedMeasurement in use-converted-measurement.ts.
 */
export function preopRiskScores(input: {
  comorbidities: { label: string }[] | undefined
  currentMedications: { label: string; atcCode?: string }[] | undefined
  labResults: { test: string; value: string; unit: string }[] | undefined
  sex: string | undefined
  smoking: boolean | null | undefined
  bmi: number | null
  ageYears: number | null | undefined
  highRiskSurgery: boolean | null | undefined
  apfelPONVHistory: boolean | null | undefined
  apfelPostopOpioids: boolean | null | undefined
  rcriInputs: readonly [unknown, unknown, unknown, unknown, unknown]
  stopbangInputs: readonly [unknown, unknown, unknown, unknown, unknown]
}) {
  const {
    comorbidities, currentMedications, labResults, sex, smoking, bmi, ageYears, highRiskSurgery,
    apfelPONVHistory, apfelPostopOpioids, rcriInputs, stopbangInputs,
  } = input

  // Suggestions only — never silently auto-checked.
  const rcriSuggested = {
    rcriIschemicHeart: suggestRcriIschemicHeart(comorbidities ?? []),
    rcriCHF:            suggestRcriCHF(comorbidities ?? []),
    rcriCVD:            suggestRcriCVD(comorbidities ?? []),
    rcriInsulinDM:      suggestRcriInsulinDM(comorbidities ?? [], currentMedications ?? []),
    rcriCreatinine:     suggestRcriCreatinine(labResults ?? []),
  }
  const stopBangBPSuggested = suggestStopBangBP(comorbidities ?? [], currentMedications ?? [])

  const rcriScore = calcRCRI({
    highRiskSurgery: !!highRiskSurgery,
    ischaemicHeartDisease: !!rcriInputs[0],
    congestiveHeartFailure: !!rcriInputs[1],
    cerebrovascularDisease: !!rcriInputs[2],
    insulinDependentDiabetes: !!rcriInputs[3],
    creatinineHigh: !!rcriInputs[4],
  })
  const apfelScore = calcApfel({
    female: sex === "FEMALE",
    // Answered `false` only -- `smoking` is tri-state and this factor is the
    // negation of the question asked. `!smoking` mapped an unanswered `null`
    // to `true`, awarding the non-smoker point to a question nobody had
    // answered yet.
    nonSmoker: smoking === false,
    ponvHistory: !!apfelPONVHistory,
    opioidsPlanned: !!apfelPostopOpioids,
  })
  const stopBangScore = calcStopBang({
    snoring: !!stopbangInputs[0],
    tired: !!stopbangInputs[1],
    observed: !!stopbangInputs[2],
    highBP: !!stopbangInputs[3],
    bmi: bmi ?? 0,
    ageOver50: ageYears != null && ageYears > 50,
    neckOver40cm: !!stopbangInputs[4],
    male: sex === "MALE",
  })

  return { rcriSuggested, stopBangBPSuggested, rcriScore, apfelScore, stopBangScore }
}
