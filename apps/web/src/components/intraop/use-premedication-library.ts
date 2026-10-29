"use client"
import { useCallback, useMemo } from "react"
import { mapPremedicationCategories } from "@lospor/core/option-library"
import { adultPremedDoseForRoute } from "@lospor/core/premedication"
import {
  buildPediatricPremedLibrary,
  pediatricPremedDoseForRoute,
  type PediatricPremedAnnotation,
  type PediatricPremedPatient,
} from "@lospor/core/pediatric-premedication-library"
import { useOptionLibrary } from "@/hooks/useOptionLibrary"
import type { PremDoseCfg, PremedCat, PremedRouteView } from "@/components/intraop/PremedicationPicker"

export type PremedicationPatient = {
  clinicalMode?: "ADULT" | "PEDIATRIC" | null
  weightKg?: number | null
  heightCm?: number | null
  sex?: string | null
  ageValue?: number | null
  ageUnit?: "DAYS" | "MONTHS" | "YEARS" | null
}

/**
 * The premedication picker's drugs and doses for one patient, shared by the
 * intraoperative record and the preop order so the two offer the same list.
 *
 * Premedication for a child is rebuilt from the child's weight and age, drug
 * by drug. Without this the picker offered a 12 kg two-year-old the adult
 * library unchanged — a gram of paracetamol — because PremDoseCfg carries a
 * fixed amount with no weight term. The rebuild lives in @lospor/core so this
 * and the mobile sheet cannot drift apart on a dose.
 */
export function usePremedicationLibrary(patient: PremedicationPatient | null | undefined) {
  const { options: premedOptions } = useOptionLibrary("PREMED_DRUG")
  const isPediatric = patient?.clinicalMode === "PEDIATRIC"
  const weightKg = patient?.weightKg ?? null
  const heightCm = patient?.heightCm ?? null
  const sex = patient?.sex ?? null
  const ageValue = patient?.ageValue ?? null
  const ageUnit = patient?.ageUnit ?? null

  const premedPatient = useMemo<PediatricPremedPatient>(() => ({
    weightKg,
    heightCm,
    sex,
    age: isPediatric && ageValue != null && ageUnit ? { value: ageValue, unit: ageUnit } : null,
  }), [ageUnit, ageValue, heightCm, isPediatric, sex, weightKg])

  const premedPediatric = useMemo(
    () => isPediatric
      ? buildPediatricPremedLibrary(mapPremedicationCategories(premedOptions), premedPatient)
      : null,
    [isPediatric, premedOptions, premedPatient],
  )

  // One list, in core's shape, whether or not this is a child: the paediatric
  // rebuild returns the same categories with the doses recomputed. The picker
  // and the dose map are then two views of that one structure rather than two
  // passes over the option table, which is how the list and its dosing came to
  // be built by different code.
  const premedCategories = useMemo<PremedCat[]>(
    () => premedPediatric ?? mapPremedicationCategories(premedOptions),
    [premedOptions, premedPediatric])

  const premedDoses = useMemo<Record<string, PremDoseCfg>>(() => {
    const map: Record<string, PremDoseCfg> = {}
    for (const category of premedCategories) {
      for (const { name, pediatric: _annotation, ...cfg } of category.drugs) map[name] = cfg
    }
    return map
  }, [premedCategories])

  /** Provenance and withheld reasons, keyed by drug, empty outside paediatric mode. */
  const premedAnnotations = useMemo<Record<string, PediatricPremedAnnotation>>(() => {
    if (!premedPediatric) return {}
    const map: Record<string, PediatricPremedAnnotation> = {}
    for (const category of premedPediatric) {
      for (const drug of category.drugs) {
        if (drug.pediatric) map[drug.name] = drug.pediatric
      }
    }
    return map
  }, [premedPediatric])

  // Oral midazolam is 0.5 mg/kg and intravenous is 0.05; leaving the previous
  // number in place across a route change is a tenfold error waiting to happen.
  const premedDoseForRoute = useCallback((drugName: string, route: string): PremedRouteView | null => {
    const cfg = premedDoses[drugName]
    if (!cfg) return null
    if (premedPediatric) {
      const next = pediatricPremedDoseForRoute({ name: drugName, ...cfg }, route, premedPatient)
      return { dose: next.status === "calculated" ? next.dose : null, unit: cfg.unit, min: cfg.min, max: cfg.max, step: cfg.step, hint: cfg.hint }
    }
    // Adults: each route has its own dose, range and step (Core, 1.4.9).
    const view = adultPremedDoseForRoute({ name: drugName, routeDoses: cfg.routeDoses }, route, weightKg)
    return view.status === "unknown" ? null : { ...view, ...(view.status === "needs-weight" ? { min: 0, max: 1000 } : {}) }
  }, [premedDoses, premedPatient, premedPediatric, weightKg])

  return { premedCategories, premedDoses, premedAnnotations, premedDoseForRoute }
}
