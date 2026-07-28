export function calcBMI(heightCm: number, weightKg: number): number {
  const h = heightCm / 100
  return Math.round((weightKg / (h * h)) * 10) / 10
}

export function calcIBW(heightCm: number, sex: "MALE" | "FEMALE" | "OTHER"): number {
  const inches = heightCm / 2.54
  const base = sex === "FEMALE" ? 45.5 : 50
  const ibw = base + 2.3 * (inches - 60)
  return Math.round(Math.max(ibw, 0) * 10) / 10
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

export function calcGupta(input: {
  asa: number
  age: number
  functionalStatus: number
  creatinine: number
  procedureRisk: number
}): number {
  const intercept = -5.25
  let logit = intercept
  logit += 0.01 * input.age
  if (input.asa === 2) logit += 0.61
  else if (input.asa === 3) logit += 1.37
  else if (input.asa >= 4) logit += 2.1
  if (input.functionalStatus === 2) logit += 0.43
  else if (input.functionalStatus === 3) logit += 0.91
  if (input.creatinine > 1.5) logit += 0.36 * (input.creatinine - 1.5)
  if (input.procedureRisk === 3) logit += 0.76
  const prob = 1 / (1 + Math.exp(-logit))
  return Math.round(prob * 1000) / 10
}

export function calcAldreteTotal(components: (number | null | undefined)[]): number {
  return components.reduce<number>((sum, v) => sum + (v ?? 0), 0)
}

export function apfelRiskLabel(score: number): string {
  if (score <= 1) return "Low (< 10%)"
  if (score === 2) return "Moderate (~40%)"
  return "High (\u2265 60%)"
}

export function rcriRiskLabel(score: number): string {
  if (score === 0) return "Very low (0.4%)"
  if (score === 1) return "Low (1.0%)"
  if (score === 2) return "Moderate (2.4%)"
  return "High (\u2265 5.4%)"
}

export function stopBangRiskLabel(score: number): string {
  if (score <= 2) return "Low OSA risk"
  if (score <= 4) return "Intermediate OSA risk"
  return "High OSA risk"
}
