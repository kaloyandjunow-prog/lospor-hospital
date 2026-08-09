import {
  buildPediatricPremedLibrary as buildCoreLibrary,
  type PediatricPremedPatient,
} from "@lospor/core/pediatric-premedication-library"
import { pediatricAgeFromPreop, type IntraopPreopSummary } from "@/lib/intraop-preop-summary"

/**
 * Mobile's adapter over the shared paediatric premedication library.
 *
 * The rebuild itself lives in `@lospor/core` so the web picker renders the same
 * doses for the same child. All that is left here is turning the intraop
 * screen's preop summary into the patient shape core expects.
 */

export {
  buildPediatricPremedLibrary as buildLibraryForPatient,
  pediatricPremedDoseForRoute,
  pediatricPremedDrug,
  type PediatricPremedAnnotation,
  type PediatricPremedCategory,
  type PediatricPremedDrug,
  type PediatricPremedPatient,
} from "@lospor/core/pediatric-premedication-library"

/** The patient fields the dose rules need, taken from the preop record. */
export function premedPatientFromPreop(
  preop: IntraopPreopSummary | null | undefined,
): PediatricPremedPatient {
  return {
    weightKg: preop?.weight ?? null,
    heightCm: preop?.height ?? null,
    sex: preop?.sex ?? null,
    age: pediatricAgeFromPreop(preop ?? null),
  }
}

export function buildPediatricPremedLibrary(
  library: Parameters<typeof buildCoreLibrary>[0],
  preop: IntraopPreopSummary | null | undefined,
) {
  return buildCoreLibrary(library, premedPatientFromPreop(preop))
}
