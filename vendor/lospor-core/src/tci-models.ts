/**
 * Target-controlled infusion models (2026-10-18): the published
 * three-compartment parameter sets a TCI pump runs, from the patient's
 * covariates. Each set was checked against at least two independent
 * implementations; where those disagreed the majority, and where it applies
 * the authors' own code, was followed (noted beside the value).
 *
 *   Propofol   Marsh 1991 · Schnider 1998 · Eleveld 2018 · Paedfusor
 *              (Absalom 2003) · Kataria 1994
 *   Remifentanil  Minto 1997 · Eleveld 2017
 *   Sufentanil    Gepts 1995
 *   Alfentanil    Maitre 1987
 *
 * Cross-checked against: STANPUMP (Shafer), the R package `tci` (Jarrett),
 * VitalDB `tivatci`, simtiva, opentiva, PyTCI, Propofol Dreams, and the
 * GALENO model sheets (Universities of Porto and Aveiro).
 *
 * Volumes are in litres and rate constants per minute. Amounts are in mg for
 * propofol (a target in µg/mL = mg/L) and µg for the opioids (ng/mL = µg/L).
 * Documentation only: LOSPOR never drives a pump.
 */

export const TCI_MODELS = [
  "MARSH", "SCHNIDER", "ELEVELD_PROPOFOL", "PAEDFUSOR", "KATARIA",
  "MINTO", "ELEVELD_REMIFENTANIL", "GEPTS", "MAITRE",
] as const
export type TciModel = typeof TCI_MODELS[number]

export const TCI_SITES = ["PLASMA", "EFFECT"] as const
export type TciSite = typeof TCI_SITES[number]

export type TciDrug = "PROPOFOL" | "REMIFENTANIL" | "SUFENTANIL" | "ALFENTANIL"

export type TciPatient = {
  ageYears: number
  weightKg: number
  heightCm: number
  sex: "MALE" | "FEMALE"
}

export type TciParams = {
  v1: number
  k10: number
  k12: number
  k13: number
  k21: number
  k31: number
  ke0: number
}

/** The target's unit and the amount the model counts in. */
export type TciUnits = { target: "mcg/mL" | "ng/mL"; amount: "mg" | "mcg" }

const PROPOFOL_UNITS: TciUnits = { target: "mcg/mL", amount: "mg" }
const OPIOID_UNITS: TciUnits = { target: "ng/mL", amount: "mcg" }

/** What each drug offers, and the target entered like a dose: range, pills, prefill. */
export type TciDrugSpec = {
  drug: TciDrug
  units: TciUnits
  adultModels: readonly TciModel[]
  childModels: readonly TciModel[]
  target: { min: number; max: number; step: number; quickValues: number[]; prefill: number }
  /** The syringe a pump assumes when none is recorded, per mL in the amount unit. */
  defaultStrengthPerMl: number
}

export const TCI_DRUG_SPECS: Readonly<Record<TciDrug, TciDrugSpec>> = {
  PROPOFOL: {
    drug: "PROPOFOL", units: PROPOFOL_UNITS,
    adultModels: ["MARSH", "SCHNIDER", "ELEVELD_PROPOFOL"],
    childModels: ["PAEDFUSOR", "KATARIA", "ELEVELD_PROPOFOL"],
    target: { min: 0.5, max: 8, step: 0.1, quickValues: [2, 3, 4, 5, 6], prefill: 4 },
    defaultStrengthPerMl: 10,
  },
  REMIFENTANIL: {
    drug: "REMIFENTANIL", units: OPIOID_UNITS,
    adultModels: ["MINTO", "ELEVELD_REMIFENTANIL"],
    childModels: ["ELEVELD_REMIFENTANIL"],
    target: { min: 0.5, max: 15, step: 0.5, quickValues: [2, 3, 4, 6, 8], prefill: 3 },
    defaultStrengthPerMl: 50,
  },
  SUFENTANIL: {
    drug: "SUFENTANIL", units: OPIOID_UNITS,
    adultModels: ["GEPTS"], childModels: [],
    target: { min: 0.05, max: 1, step: 0.01, quickValues: [0.1, 0.2, 0.3, 0.4, 0.5], prefill: 0.2 },
    defaultStrengthPerMl: 5,
  },
  ALFENTANIL: {
    drug: "ALFENTANIL", units: OPIOID_UNITS,
    adultModels: ["MAITRE"], childModels: [],
    target: { min: 10, max: 300, step: 5, quickValues: [50, 75, 100, 150], prefill: 75 },
    defaultStrengthPerMl: 500,
  },
}

export const TCI_MODEL_DRUG: Readonly<Record<TciModel, TciDrug>> = {
  MARSH: "PROPOFOL", SCHNIDER: "PROPOFOL", ELEVELD_PROPOFOL: "PROPOFOL", PAEDFUSOR: "PROPOFOL", KATARIA: "PROPOFOL",
  MINTO: "REMIFENTANIL", ELEVELD_REMIFENTANIL: "REMIFENTANIL", GEPTS: "SUFENTANIL", MAITRE: "ALFENTANIL",
}

export const TCI_MODEL_LABELS: Readonly<Record<TciModel, string>> = {
  MARSH: "Marsh", SCHNIDER: "Schnider", ELEVELD_PROPOFOL: "Eleveld", PAEDFUSOR: "Paedfusor", KATARIA: "Kataria",
  MINTO: "Minto", ELEVELD_REMIFENTANIL: "Eleveld", GEPTS: "Gepts", MAITRE: "Maitre",
}

/** The TCI drug a catalogue name is, if it is one ("Propofol 1%" → PROPOFOL). */
export function tciDrugFor(name: string | null | undefined): TciDrug | null {
  const n = (name ?? "").toLowerCase()
  if (/\bpropofol\b/.test(n)) return "PROPOFOL"
  if (/\bremifentanil\b/.test(n)) return "REMIFENTANIL"
  if (/\bsufentanil\b/.test(n)) return "SUFENTANIL"
  if (/\balfentanil\b/.test(n)) return "ALFENTANIL"
  return null
}

/** The models offered for a drug: the children's list under 16 (Eleveld covers all ages). */
export function tciModelsFor(drug: TciDrug, pediatric: boolean): readonly TciModel[] {
  const spec = TCI_DRUG_SPECS[drug]
  return pediatric ? spec.childModels : spec.adultModels
}

// ── Covariates ──────────────────────────────────────────────────────────────

/** James lean body mass (Schnider, Minto). */
export function jamesLbm(patient: Pick<TciPatient, "weightKg" | "heightCm" | "sex">): number {
  const { weightKg: w, heightCm: h, sex } = patient
  return sex === "MALE" ? 1.1 * w - 128 * (w / h) ** 2 : 1.07 * w - 148 * (w / h) ** 2
}

/**
 * The James formula turns over in obesity -- past the weight where its
 * derivative is zero, a heavier patient gets less lean mass -- and Schnider
 * and Minto become meaningless there. Commercial pumps refuse; so do we.
 */
export function jamesLbmValid(patient: Pick<TciPatient, "weightKg" | "heightCm" | "sex">): boolean {
  const { weightKg: w, heightCm: h, sex } = patient
  const turn = sex === "MALE" ? 1.1 * h * h / (2 * 128) : 1.07 * h * h / (2 * 148)
  return w > 0 && h > 0 && w <= turn && jamesLbm(patient) > 0
}

/** Al-Sallami fat-free mass (Eleveld), BMI in kg/m². */
export function alSallamiFfm(patient: TciPatient): number {
  const { ageYears: age, weightKg: w, heightCm: h, sex } = patient
  const bmi = 10000 * w / (h * h)
  return sex === "MALE"
    ? (0.88 + (1 - 0.88) / (1 + (age / 13.4) ** -12.7)) * (9270 * w) / (6680 + 216 * bmi)
    : (1.11 + (1 - 1.11) / (1 + (age / 7.1) ** -1.1)) * (9270 * w) / (8780 + 244 * bmi)
}

const sigmoid = (x: number, e50: number, lambda: number) => x ** lambda / (x ** lambda + e50 ** lambda)

/** Volumes and clearances to rate constants. */
function fromClearances(v1: number, v2: number, v3: number, cl: number, q2: number, q3: number, ke0: number): TciParams {
  return { v1, k10: cl / v1, k12: q2 / v1, k13: q3 / v1, k21: q2 / v2, k31: q3 / v3, ke0 }
}

// ── The models ──────────────────────────────────────────────────────────────

export type TciModelOptions = {
  /** Eleveld propofol: an opioid is given with it (lower clearance and V3 with age). */
  opioids?: boolean
}

function marsh(p: TciPatient): TciParams {
  // ke0 1.2/min: the modified Marsh (Struys 2000, tpeak 1.6 min) every
  // effect-site pump uses; the Diprifusor's 0.26 was for plasma targeting.
  return { v1: 0.228 * p.weightKg, k10: 0.119, k12: 0.112, k13: 0.042, k21: 0.055, k31: 0.0033, ke0: 1.2 }
}

function schnider(p: TciPatient): TciParams {
  // Clearance is on weight, lean body mass and height; Q2 falls with age. The
  // R package `tci` writes LBM where the paper has weight and +0.024 for Q2;
  // the paper, STANPUMP, GALENO and PyTCI agree on weight and -0.024.
  const lbm = jamesLbm(p)
  const v1 = 4.27
  const v2 = 18.9 - 0.391 * (p.ageYears - 53)
  const v3 = 238
  const cl = 1.89 + 0.0456 * (p.weightKg - 77) - 0.0681 * (lbm - 59) + 0.0264 * (p.heightCm - 177)
  const q2 = 1.29 - 0.024 * (p.ageYears - 53)
  return fromClearances(v1, v2, v3, cl, q2, 0.836, 0.456)
}

function eleveldPropofol(p: TciPatient, opioids: boolean): TciParams {
  // Arterial (the reference parameterisation). Q2 uses (1 - fQ3maturation)
  // un-normalised with θ5 = 1.75, as VitalDB tivatci, simtiva, the R
  // package and Propofol Dreams do (PyTCI normalises; opentiva uses 1.83).
  const age = p.ageYears
  const pma = age * 52 + 40
  const pmaRef = 35 * 52 + 40
  const fCentral = (w: number) => sigmoid(w, 33.6, 1)
  const ffm = alSallamiFfm(p)
  const ffmRef = alSallamiFfm({ ageYears: 35, weightKg: 70, heightCm: 170, sex: "MALE" })
  const opiate = (theta: number) => opioids ? Math.exp(theta * age) : 1
  const v1 = 6.28 * fCentral(p.weightKg) / fCentral(70)
  const v2 = 25.5 * (p.weightKg / 70) * Math.exp(-0.0156 * (age - 35))
  const v3 = 273 * (ffm / ffmRef) * opiate(-0.0138)
  const clMat = sigmoid(pma, 42.3, 9.06) / sigmoid(pmaRef, 42.3, 9.06)
  const cl = (p.sex === "MALE" ? 1.79 : 2.10) * (p.weightKg / 70) ** 0.75 * clMat * opiate(-0.00286)
  const q3Mat = sigmoid(pma, 68.3, 1)
  const q2 = 1.75 * (v2 / 25.5) ** 0.75 * (1 + 1.30 * (1 - q3Mat))
  const q3 = 1.11 * (v3 / 273) ** 0.75 * (q3Mat / sigmoid(pmaRef, 68.3, 1))
  const ke0 = 0.146 * (p.weightKg / 70) ** -0.25
  return fromClearances(v1, v2, v3, cl, q2, q3, ke0)
}

function paedfusor(p: TciPatient): TciParams {
  // Absalom 2003: weight-scaled below 13 years, then banded to Marsh at 16.
  // ke0 0.91/min (Muñoz 2004), as tivatci; the model was published for
  // plasma targeting.
  const w = p.weightKg
  const age = p.ageYears
  const [v1, k10] = age < 13 ? [0.4584 * w, 0.1527 * w ** -0.3]
    : age < 14 ? [0.4 * w, 0.0678]
      : age < 15 ? [0.342 * w, 0.0792]
        : age < 16 ? [0.284 * w, 0.0954]
          : [0.22857 * w, 0.119]
  return { v1, k10, k12: 0.114, k13: 0.0419, k21: 0.055, k31: 0.0033, ke0: 0.91 }
}

function kataria(p: TciPatient): TciParams {
  // The age-covariate model (STANPUMP, tivatci: V2 constant -15.5); ke0
  // 0.41/min (Muñoz 2004).
  const w = p.weightKg
  return fromClearances(0.41 * w, 0.78 * w + 3.1 * p.ageYears - 15.5, 6.9 * w, 0.035 * w, 0.077 * w, 0.026 * w, 0.41)
}

function minto(p: TciPatient): TciParams {
  const lbm = jamesLbm(p)
  const a = p.ageYears - 40
  const v1 = 5.1 - 0.0201 * a + 0.072 * (lbm - 55)
  const v2 = 9.82 - 0.0811 * a + 0.108 * (lbm - 55)
  const cl = 2.6 - 0.0162 * a + 0.0191 * (lbm - 55)
  const q2 = 2.05 - 0.0301 * a
  const q3 = 0.076 - 0.00113 * a
  return fromClearances(v1, v2, 5.42, cl, q2, q3, 0.595 - 0.007 * a)
}

function eleveldRemifentanil(p: TciPatient): TciParams {
  // V3 on its own reference (5.03) and -0.026 per kg, as simtiva; the R
  // package scales V3 by V2's reference and Propofol Dreams has -0.036.
  const age = p.ageYears
  const size = alSallamiFfm(p) / alSallamiFfm({ ageYears: 35, weightKg: 70, heightCm: 170, sex: "MALE" })
  const ageing = (theta: number) => Math.exp(theta * (age - 35))
  const kMat = sigmoid(p.weightKg, 2.88, 2) / sigmoid(70, 2.88, 2)
  const kSex = p.sex === "MALE" ? 1 : 1 + 0.470 * sigmoid(age, 12, 6) * (1 - sigmoid(age, 45, 6))
  const v1 = 5.81 * size * ageing(-0.00554)
  const v2 = 8.82 * size * ageing(-0.00327) * kSex
  const v3 = 5.03 * size * ageing(-0.0315) * Math.exp(-0.026 * (p.weightKg - 70))
  const cl = 2.58 * size ** 0.75 * kMat * kSex * ageing(-0.00327)
  const q2 = 1.72 * (v2 / 8.82) ** 0.75 * ageing(-0.00554) * kSex
  const q3 = 0.124 * (v3 / 5.03) ** 0.75 * ageing(-0.00554)
  return fromClearances(v1, v2, v3, cl, q2, q3, 1.09 * ageing(-0.0289))
}

function gepts(): TciParams {
  // Not weight-scaled. ke0 0.112/min as the Fresenius Base Primea and tivatci
  // (Scott 1991); STANPUMP's 0.119 has no stated source.
  return fromClearances(14.3, 63.1, 261.6, 0.92, 1.55, 0.33, 0.112)
}

function maitre(p: TciPatient): TciParams {
  const v1 = 0.111 * p.weightKg * (p.sex === "FEMALE" ? 1.15 : 1)
  const old = p.ageYears > 40 ? p.ageYears - 40 : 0
  const cl = 0.356 - 0.00269 * old
  return { v1, k10: cl / v1, k12: 0.104, k13: 0.017, k21: 0.0673, k31: 0.0126 - 0.000113 * old, ke0: 0.77 }
}

/** The patient's parameters for a model. Throws only for a model that cannot apply (see tciModelProblems). */
export function tciParams(model: TciModel, patient: TciPatient, options: TciModelOptions = {}): TciParams {
  switch (model) {
    case "MARSH": return marsh(patient)
    case "SCHNIDER": return schnider(patient)
    case "ELEVELD_PROPOFOL": return eleveldPropofol(patient, options.opioids ?? true)
    case "PAEDFUSOR": return paedfusor(patient)
    case "KATARIA": return kataria(patient)
    case "MINTO": return minto(patient)
    case "ELEVELD_REMIFENTANIL": return eleveldRemifentanil(patient)
    case "GEPTS": return gepts()
    case "MAITRE": return maitre(patient)
  }
}

// ── Where a model applies ───────────────────────────────────────────────────

export type TciModelProblem =
  /**
   * The model cannot be computed for this patient: the James formula has
   * turned over, or a volume or rate constant comes out at zero or below
   * (Kataria's V2 in an infant, Schnider's V2 past 100 years).
   */
  | { kind: "unavailable"; reason: "lean-body-mass" | "parameters" }
  /** Outside the population the model was built on: allowed, and said. */
  | { kind: "outside"; covariate: "age" | "weight"; min?: number; max?: number }

const VALIDATED: Partial<Record<TciModel, { age?: [number, number]; weight?: [number, number] }>> = {
  MARSH: { age: [16, 120] },
  SCHNIDER: { age: [25, 81], weight: [44, 123] },
  PAEDFUSOR: { age: [1, 16], weight: [5, 61] },
  KATARIA: { age: [3, 16], weight: [15, 61] },
  MINTO: { age: [20, 85], weight: [45, 106] },
  GEPTS: { age: [18, 120] },
  MAITRE: { age: [18, 120] },
}

/** Why a model may not suit this patient; empty when it does. */
export function tciModelProblems(model: TciModel, patient: TciPatient): TciModelProblem[] {
  const problems: TciModelProblem[] = []
  if ((model === "SCHNIDER" || model === "MINTO") && !jamesLbmValid(patient)) {
    problems.push({ kind: "unavailable", reason: "lean-body-mass" })
  } else if (!Object.values(tciParams(model, patient)).every(value => Number.isFinite(value) && value > 0)) {
    // A negative volume would be simulated as nonsense, not refused.
    problems.push({ kind: "unavailable", reason: "parameters" })
  }
  const range = VALIDATED[model]
  if (range?.age && (patient.ageYears < range.age[0] || patient.ageYears > range.age[1])) {
    problems.push({ kind: "outside", covariate: "age", min: range.age[0], max: range.age[1] })
  }
  if (range?.weight && (patient.weightKg < range.weight[0] || patient.weightKg > range.weight[1])) {
    problems.push({ kind: "outside", covariate: "weight", min: range.weight[0], max: range.weight[1] })
  }
  return problems
}

export const tciModelUsable = (model: TciModel, patient: TciPatient) =>
  !tciModelProblems(model, patient).some(problem => problem.kind === "unavailable")
