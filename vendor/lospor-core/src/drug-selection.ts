import type {
  DoseCalc,
  DoseProfile,
  LocalAnaestheticFormulation,
  RouteMode,
  WeightBasis,
} from "./catalog/dose-profile"
import {
  canonicalConcentrationUnit,
  canonicalizeDoseProfile,
  normalizeAdministrationRoute,
  type ConcentrationUnit,
} from "./clinical-rule-vocabulary"
import { roundToPracticalDose } from "./dose-rounding"

export type DrugSelectionPatientContext = {
  totalBodyWeightKg?: number | null
  idealBodyWeightKg?: number | null
  idealBodyWeightMethod?: string | null
  bodySurfaceAreaM2?: number | null
}

export type DrugDoseCalculationAudit = {
  basis: "FLAT" | Exclude<WeightBasis, "none">
  calculationWeight?: number
  calculationMethod?: string
}

export type CanonicalConcentrationSelection = {
  label: string
  value: number
  unit: ConcentrationUnit
}

export type DrugSelectionSurface = {
  route: string
  routes: string[]
  mode: RouteMode["mode"]
  min: number
  max: number
  step: number
  quickValues: number[]
  unit: string
  dose: string
  concentrationOptions: string[]
  concentration: string
  concentrationUnit?: string
  formulationOptions: LocalAnaestheticFormulation[]
  formulation?: LocalAnaestheticFormulation
  calculation?: DrugDoseCalculationAudit
  calculationUnavailableReason?:
    | "MISSING_TBW"
    | "MISSING_IBW"
    | "MISSING_BSA"
    | "NO_AUTOFILL"
}

function finitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

/**
 * How far above the calculated dose a one-tap quick value may sit.
 *
 * Quick values are authored per drug, not per patient: a paediatric band
 * commonly spans a 4 kg neonate and an 80 kg adolescent, so its pills are sized
 * for the top of the band. Left alone, a neonate whose calculated propofol dose
 * is 10 mg is offered 400 mg on the same row, looking exactly as legitimate.
 *
 * The multiple is deliberately generous. It is not a dose limit — the slider,
 * its declared maximum and manual entry are all untouched, so any dose the
 * profile permits can still be given and recorded. It only decides which values
 * are worth a single tap, and a tap is where a mis-selection happens silently.
 *
 * Applied on the paediatric path only, via `clampQuickValuesToCalculatedDose`.
 * Adult ladders are authored for adults, and several carry a legitimate dose far
 * above the routine calculated one — sugammadex 16 mg/kg for immediate reversal
 * against a 2 mg/kg routine reversal, heparin for bypass against a ward dose.
 * Clamping those would remove the pill exactly when it is needed most.
 */
export const QUICK_DOSE_CEILING_MULTIPLE = 3

/**
 * Keeps the quick values a patient of this size could plausibly receive.
 *
 * Applies only when a dose was actually calculated: with no weight, no
 * calculation or a profile that declares none, the authored pills are all the
 * clinician has and are returned untouched. That is the same reason a LOCAL or
 * manual-entry band is unaffected — it has no calculation to measure against.
 *
 * When every pill sits above the ceiling — a small enough patient on an
 * adult-authored ladder — the calculated dose is offered as the single quick
 * value rather than leaving an empty row. That value is not invented here; it
 * is the same suggestion the surface already reports in `dose`.
 */
function clampQuickValues(input: {
  quickValues: number[]
  calculatedDose: string
  max: number
}): number[] {
  const calculated = Number(input.calculatedDose)
  if (!finitePositive(calculated)) return input.quickValues
  const ceiling = calculated * QUICK_DOSE_CEILING_MULTIPLE
  const kept = input.quickValues.filter(value => value <= ceiling)
  if (kept.length) return kept
  return calculated <= input.max ? [calculated] : []
}

function activeRoute(profile: DoseProfile, requestedRoute?: string | null): string {
  const requested = requestedRoute ? normalizeAdministrationRoute(requestedRoute) : null
  if (requested && profile.routes.includes(requested)) return requested
  return profile.defaultRoute || profile.routes[0] || "IV"
}

function roundCalculatedDose(value: number, increment: number | undefined, mode: DoseProfile["rounding"]): number {
  // Snaps to the declared increment, or to a drawable one when the declared
  // increment is missing or finer than a clinician could measure. Adult profiles
  // declare sensible increments already (propofol 10 mg) and are unaffected;
  // this rescues the paediatric profiles, whose roundTo came from the UI step.
  return roundToPracticalDose(value, increment, mode)
}

function calculatedDose(input: {
  calculation?: DoseCalc
  profileBasis: WeightBasis
  rounding: DoseProfile["rounding"]
  patient: DrugSelectionPatientContext
  allowWeightBasisFallback: boolean
}): Pick<DrugSelectionSurface, "dose" | "calculation" | "calculationUnavailableReason"> {
  const calculation = input.calculation
  if (!calculation) return { dose: "", calculationUnavailableReason: "NO_AUTOFILL" }
  if (calculation.flat != null) {
    const amount = calculation.cap == null
      ? calculation.flat
      : Math.min(calculation.flat, calculation.cap)
    return { dose: String(roundCalculatedDose(amount, calculation.roundTo, input.rounding)), calculation: { basis: "FLAT" } }
  }

  const basis = calculation.basis
    ?? (input.profileBasis === "none" ? "IBW" : input.profileBasis)
  let scalar: number | null = null
  let unavailable: DrugSelectionSurface["calculationUnavailableReason"]
  if (basis === "TBW") {
    scalar = finitePositive(input.patient.totalBodyWeightKg)
      ? input.patient.totalBodyWeightKg
      : input.allowWeightBasisFallback && finitePositive(input.patient.idealBodyWeightKg)
        ? input.patient.idealBodyWeightKg
        : null
    unavailable = "MISSING_TBW"
  } else if (basis === "IBW") {
    scalar = finitePositive(input.patient.idealBodyWeightKg)
      ? input.patient.idealBodyWeightKg
      : input.allowWeightBasisFallback && finitePositive(input.patient.totalBodyWeightKg)
        ? input.patient.totalBodyWeightKg
        : null
    if (
      scalar != null
      && (calculation.capAtActualWeight ?? true)
      && finitePositive(input.patient.totalBodyWeightKg)
    ) {
      scalar = Math.min(scalar, input.patient.totalBodyWeightKg)
    }
    unavailable = "MISSING_IBW"
  } else {
    scalar = finitePositive(input.patient.bodySurfaceAreaM2) ? input.patient.bodySurfaceAreaM2 : null
    unavailable = "MISSING_BSA"
  }
  if (scalar == null) return { dose: "", calculationUnavailableReason: unavailable }

  const multiplier = basis === "BSA_M2" ? calculation.perM2 : calculation.perKg
  if (multiplier == null) return { dose: "", calculationUnavailableReason: "NO_AUTOFILL" }
  let amount = roundCalculatedDose(scalar * multiplier, calculation.roundTo, input.rounding)
  if (calculation.cap != null) amount = Math.min(amount, calculation.cap)
  return {
    dose: String(amount),
    calculation: {
      basis,
      calculationWeight: scalar,
      ...(basis === "IBW" && input.patient.idealBodyWeightMethod
        ? { calculationMethod: input.patient.idealBodyWeightMethod }
        : {}),
    },
  }
}

export function resolveDrugSelectionSurface(input: {
  profile: DoseProfile
  route?: string | null
  patient?: DrugSelectionPatientContext
  allowWeightBasisFallback?: boolean
  /** See QUICK_DOSE_CEILING_MULTIPLE. Paediatric callers opt in; adults do not. */
  clampQuickValuesToCalculatedDose?: boolean
}): DrugSelectionSurface {
  const profile = canonicalizeDoseProfile(input.profile)
  const route = activeRoute(profile, input.route)
  const routeProfile = profile.routeModes?.[route]
  const min = routeProfile?.min ?? profile.min ?? 0
  const max = routeProfile?.max ?? profile.max ?? Math.max(min + 1, 100)
  const step = routeProfile?.step ?? profile.step ?? profile.variableStep?.[0]?.step ?? 1
  const concentrationOptions = routeProfile?.concentrationOptions
    ?? profile.concentrationOptions
    ?? []
  const preferredConcentration = routeProfile?.defaultConcentration
    ?? routeProfile?.suggestedConcentration
    ?? profile.defaultConcentration
    ?? profile.suggestedConcentration
  const concentration = preferredConcentration && concentrationOptions.includes(preferredConcentration)
    ? preferredConcentration
    : concentrationOptions[0] ?? ""
  const formulationOptions = routeProfile?.formulationOptions
    ?? profile.formulationOptions
    ?? []
  const preferredFormulation = routeProfile?.defaultFormulation ?? profile.defaultFormulation
  const formulation = preferredFormulation && formulationOptions.includes(preferredFormulation)
    ? preferredFormulation
    : formulationOptions[0]
  const calculation = calculatedDose({
    calculation: routeProfile?.doseCalc ?? profile.doseCalcByRoute?.[route] ?? profile.doseCalc,
    profileBasis: routeProfile?.weightBasis ?? profile.weightBasis,
    rounding: profile.rounding,
    patient: input.patient ?? {},
    allowWeightBasisFallback: input.allowWeightBasisFallback ?? false,
  })
  return {
    route,
    routes: [...profile.routes],
    mode: routeProfile?.mode ?? profile.mode,
    min,
    max,
    step,
    quickValues: input.clampQuickValuesToCalculatedDose
      ? clampQuickValues({
          quickValues: [...(routeProfile?.quickValues ?? profile.quickValues)],
          calculatedDose: calculation.dose,
          max,
        })
      : [...(routeProfile?.quickValues ?? profile.quickValues)],
    unit: routeProfile?.unit ?? profile.unit ?? "mg",
    ...calculation,
    concentrationOptions: [...concentrationOptions],
    concentration,
    concentrationUnit: routeProfile?.concentrationUnit ?? profile.concentrationUnit,
    formulationOptions: [...formulationOptions],
    formulation,
  }
}

export function canonicalConcentrationSelection(
  label: string | null | undefined,
  explicitUnit?: string | null,
): CanonicalConcentrationSelection | null {
  const normalized = label?.trim()
  if (!normalized) return null
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)\s*(%|mcg\/mL|mg\/mL|IU\/mL|mmol\/mL|mEq\/mL)$/i)
  if (!match) return null
  const value = Number(match[1])
  const unit = canonicalConcentrationUnit(explicitUnit ?? match[2] ?? "")
  if (!Number.isFinite(value) || value <= 0 || !unit) return null
  return { label: normalized, value, unit: unit.kind }
}
