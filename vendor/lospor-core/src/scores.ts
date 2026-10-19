export function calcBMI(heightCm: number, weightKg: number): number {
  const h = heightCm / 100
  return Math.round((weightKg / (h * h)) * 10) / 10
}

export function calcIBW(heightCm: number, sex: "MALE" | "FEMALE" | "OTHER"): number {
  const result = calculateDevineIdealBodyWeight({ heightCm, sex })
  return result.available ? result.roundedKg : 0
}

export function calcABW(ibw: number, actualKg: number): number | null {
  if (actualKg <= ibw) return null
  return Math.round((ibw + 0.4 * (actualKg - ibw)) * 10) / 10
}

export function calcApfel(input: {
  female: boolean
  nonSmoker: boolean
  ponvHistory: boolean
  opioidsPlanned: boolean
}): number {
  return [input.female, input.nonSmoker, input.ponvHistory, input.opioidsPlanned].filter(Boolean).length
}

export function calcStopBang(input: {
  snoring: boolean
  tired: boolean
  observed: boolean
  highBP: boolean
  bmi: number
  ageOver50: boolean
  neckOver40cm: boolean
  male: boolean
}): number {
  return [
    input.snoring,
    input.tired,
    input.observed,
    input.highBP,
    input.bmi > 35,
    input.ageOver50,
    input.neckOver40cm,
    input.male,
  ].filter(Boolean).length
}

export function calcRCRI(input: {
  highRiskSurgery: boolean
  ischaemicHeartDisease: boolean
  congestiveHeartFailure: boolean
  cerebrovascularDisease: boolean
  insulinDependentDiabetes: boolean
  creatinineHigh: boolean
}): number {
  return [
    input.highRiskSurgery,
    input.ischaemicHeartDisease,
    input.congestiveHeartFailure,
    input.cerebrovascularDisease,
    input.insulinDependentDiabetes,
    input.creatinineHigh,
  ].filter(Boolean).length
}

// Gupta MICA lives in gupta.ts. The calcGupta that was here used invented
// coefficients and was never called.

export function calcAldreteTotal(components: (number | null | undefined)[]): number {
  return components.reduce<number>((sum, v) => sum + (v ?? 0), 0)
}

import { calculateDevineIdealBodyWeight } from "./ideal-body-weight"
