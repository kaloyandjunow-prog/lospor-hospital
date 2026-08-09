import { calcApfel, calcBMI, calcRCRI, calcStopBang } from "./scores"
import { calculateMostellerBsa } from "./pediatric-calculators"
import type { ClinicalMode } from "./pediatric"

export type PreopPayloadValues = Record<string, unknown> & {
  heightCm?: number
  weightKg?: number
  sex?: string
  diagnoses?: { label?: string }[]
  procedures?: { label?: string }[]
  clinicalMode?: ClinicalMode
}

export function derivePreopScores(values: PreopPayloadValues): {
  bmi?: number
  bodySurfaceAreaM2?: number
  rcriScore?: number
  apfelScore?: number
  stopBangScore?: number
} {
  const bmi = values.heightCm && values.weightKg ? calcBMI(values.heightCm, values.weightKg) : undefined
  const bsaResult = values.heightCm && values.weightKg
    ? calculateMostellerBsa({ heightCm: values.heightCm, weightKg: values.weightKg })
    : null
  const bodySurfaceAreaM2 = bsaResult?.available ? bsaResult.value.squareMetres : undefined
  if (values.clinicalMode === "PEDIATRIC") {
    return {
      bmi,
      bodySurfaceAreaM2,
      rcriScore: undefined,
      apfelScore: undefined,
      stopBangScore: undefined,
    }
  }
  const computedBmi = bmi ?? null
  return {
    bmi,
    bodySurfaceAreaM2,
    rcriScore: calcRCRI({
      highRiskSurgery: !!values.highRiskSurgery,
      ischaemicHeartDisease: !!values.rcriIschemicHeart,
      congestiveHeartFailure: !!values.rcriCHF,
      cerebrovascularDisease: !!values.rcriCVD,
      insulinDependentDiabetes: !!values.rcriInsulinDM,
      creatinineHigh: !!values.rcriCreatinine,
    }),
    apfelScore: calcApfel({
      female: values.sex === "FEMALE",
      nonSmoker: !values.smoking,
      ponvHistory: !!values.apfelPONVHistory,
      opioidsPlanned: !!values.apfelPostopOpioids,
    }),
    stopBangScore: calcStopBang({
      snoring: !!values.stopbangSnoring,
      tired: !!values.stopbangTired,
      observed: !!values.stopbangObserved,
      highBP: !!values.stopbangBP,
      bmi: computedBmi ?? 0,
      ageOver50: typeof values.ageYears === "number" && values.ageYears > 50,
      neckOver40cm: !!values.stopbangNeck,
      male: values.sex === "MALE",
    }),
  }
}

export function buildCanonicalPreopPayload<T extends PreopPayloadValues>(values: T): T & {
  bmi?: number
  bodySurfaceAreaM2?: number
  rcriScore?: number
  apfelScore?: number
  stopBangScore?: number
  diagnosis: string
  plannedProcedure: string
} {
  const scores = derivePreopScores(values)
  return {
    ...values,
    ...scores,
    diagnosis: (values.diagnoses ?? []).map(d => d.label ?? "").join("; "),
    plannedProcedure: (values.procedures ?? []).map(p => p.label ?? "").join("; "),
  }
}
