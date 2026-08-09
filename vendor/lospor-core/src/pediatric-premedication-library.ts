import type { PremedicationCategory, PremedicationDrug } from "./option-library"
import type { PediatricAgeInput } from "./pediatric"
import {
  hasPediatricPremedication,
  pediatricPremedicationRoutes,
  resolvePediatricPremedication,
  type PediatricPremedicationResolution,
  type PremedicationWeightBasis,
} from "./pediatric-premedication"

/**
 * The premedication library as it should appear for a child.
 *
 * Paediatric mode on mobile used to be handed an empty list; on web it was
 * handed the adult one unchanged, so a 12 kg two-year-old was offered the adult
 * gram of paracetamol. Neither client could fix this alone — `PremedicationDrug`
 * carries a fixed amount with no weight term, so the rebuild has to happen
 * between the option library and the picker.
 *
 * It lives in core rather than in either client because both render the same
 * list for the same child, and two implementations would eventually disagree
 * about a dose. There is nothing platform-specific here: it is a pure function
 * from (library, patient) to library.
 */

export type PediatricPremedPatient = {
  weightKg?: number | null
  heightCm?: number | null
  sex?: string | null
  age?: PediatricAgeInput | null
}

export type PediatricPremedAnnotation =
  | {
      kind: "calculated"
      perKg: number
      unit: string
      weightUsedKg: number
      basis: PremedicationWeightBasis
      capped: boolean
      cap: number
    }
  | { kind: "withheld"; reason: string }
  | { kind: "manual"; reason: string }
  | { kind: "needs-weight"; reason: string }

export type PediatricPremedDrug = PremedicationDrug & {
  pediatric?: PediatricPremedAnnotation
}

export type PediatricPremedCategory = {
  category: string
  drugs: PediatricPremedDrug[]
}

function annotate(resolution: PediatricPremedicationResolution): PediatricPremedAnnotation {
  switch (resolution.status) {
    case "calculated":
      return {
        kind: "calculated",
        perKg: resolution.perKg,
        unit: resolution.unit,
        weightUsedKg: resolution.weightUsedKg,
        basis: resolution.basis,
        capped: resolution.capped,
        cap: resolution.cap,
      }
    case "withheld":
      return { kind: "withheld", reason: resolution.reason }
    case "needs-weight":
      return { kind: "needs-weight", reason: resolution.reason }
    default:
      return { kind: "manual", reason: resolution.reason }
  }
}

/**
 * Rebuilds one drug for this child, or returns null if it should not be offered.
 *
 * A drug with no paediatric rule is dropped rather than shown at its adult
 * amount. A drug that is deliberately withheld — codeine, aspirin — is kept and
 * marked, because "not for this child, and here is why" is more useful at 2am
 * than a drug that silently is not in the list.
 */
export function pediatricPremedDrug(
  drug: PremedicationDrug,
  patient: PediatricPremedPatient,
): PediatricPremedDrug | null {
  const request = {
    weightKg: patient.weightKg ?? null,
    heightCm: patient.heightCm ?? null,
    sex: patient.sex ?? null,
    age: patient.age ?? null,
  }

  const withheldProbe = resolvePediatricPremedication({
    drug: drug.name,
    route: drug.defaultRoute,
    ...request,
  })
  if (withheldProbe.status === "withheld") {
    return { ...drug, dose: 0, pediatric: annotate(withheldProbe) }
  }

  const routes = pediatricPremedicationRoutes(drug.name)
  if (!routes.length || !hasPediatricPremedication(drug.name)) return null

  const defaultRoute = routes.includes(drug.defaultRoute) ? drug.defaultRoute : routes[0]
  const resolution = resolvePediatricPremedication({
    drug: drug.name,
    route: defaultRoute,
    ...request,
  })

  if (resolution.status !== "calculated") {
    return {
      ...drug,
      dose: 0,
      routes,
      defaultRoute,
      hint: resolution.reason,
      pediatric: annotate(resolution),
    }
  }

  return {
    ...drug,
    dose: resolution.dose,
    unit: resolution.unit,
    min: resolution.min,
    max: resolution.max,
    step: resolution.step,
    routes,
    defaultRoute,
    hint: resolution.hint,
    pediatric: annotate(resolution),
  }
}

/**
 * Recomputes the dose when the clinician switches route inside the picker.
 *
 * Oral midazolam is 0.5 mg/kg and intravenous is 0.05. Leaving the previous
 * number in place across a route change is a tenfold error waiting to be
 * pressed, so both clients call this on every change.
 */
export function pediatricPremedDoseForRoute(
  drug: PremedicationDrug,
  route: string,
  patient: PediatricPremedPatient,
): PediatricPremedicationResolution {
  return resolvePediatricPremedication({
    drug: drug.name,
    route,
    weightKg: patient.weightKg ?? null,
    heightCm: patient.heightCm ?? null,
    sex: patient.sex ?? null,
    age: patient.age ?? null,
  })
}

export function buildPediatricPremedLibrary(
  library: PremedicationCategory[],
  patient: PediatricPremedPatient,
): PediatricPremedCategory[] {
  return library
    .map(category => ({
      category: category.category,
      drugs: category.drugs
        .map(drug => pediatricPremedDrug(drug, patient))
        .filter((drug): drug is PediatricPremedDrug => drug !== null),
    }))
    .filter(category => category.drugs.length > 0)
}
