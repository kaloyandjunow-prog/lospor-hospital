import type { ClinicalMode } from "@lospor/core/pediatric"

/**
 * Switch a case between adult and paediatric mode, with everything that costs.
 *
 * Changing mode is not a relabelling. The adult risk scores and the adult
 * vitals do not mean anything in paediatric mode and the paediatric fasting
 * record does not mean anything in adult mode, so each is cleared on the way
 * across, and AI consent is withdrawn because the clinician consented for a
 * different assessment.
 *
 * Extracted because there are now two ways to ask for it -- the Adult /
 * Paediatric toggle, and the EHR review row for an imported age that belongs
 * to the other mode -- and two copies of a rule that discards recorded
 * observations is how they come to disagree about which observations.
 */
export function applyClinicalModeSwitch(
  next: ClinicalMode,
  current: { ageYears?: number | null; ageValue?: number | null; ageUnit?: string | null },
  setValue: (field: string, value: unknown, options: { shouldDirty: true }) => void,
): void {
  const dirty = { shouldDirty: true } as const
  setValue("clinicalMode", next, dirty)
  setValue("aiOptIn", false, dirty)

  if (next === "PEDIATRIC") {
    const years = current.ageYears != null && current.ageYears < 18 ? current.ageYears : undefined
    setValue("ageUnit", "YEARS", dirty)
    setValue("ageValue", years, dirty)
    setValue("ageYears", years, dirty)
    for (const field of [
      "rcriScore", "apfelScore", "stopBangScore",
      "bpSystolic", "bpDiastolic", "heartRate", "spO2", "temperature", "respiratoryRate",
    ]) setValue(field, undefined, dirty)
    return
  }

  // null, not undefined: undefined is dropped from the patch, so the server
  // keeps the pediatric age it has and refuses adult mode on every retry.
  setValue("ageYears", current.ageValue != null && current.ageUnit === "YEARS" ? current.ageValue : null, dirty)
  setValue("ageValue", null, dirty)
  setValue("ageUnit", null, dirty)
  setValue("pediatricFasting", [], dirty)
  setValue("coldsApplicable", false, dirty)
}

/**
 * Write an accepted EHR import into the form (1.4.23).
 *
 * An imported age that belongs to the other mode switches the case first, with
 * exactly what the Adult / Paediatric toggle does: it clears that mode's
 * vitals and scores and normalises the age. The import is written over it
 * afterwards, so nothing just imported is cleared, and both reach the server
 * in one save, so it never sees the age in the wrong mode.
 */
export function applyEhrImportToForm(
  patch: Record<string, unknown>,
  modeChange: ClinicalMode | null,
  getValues: (field: string) => unknown,
  setValue: (field: string, value: unknown, options: { shouldDirty: true }) => void,
): void {
  if (modeChange) {
    applyClinicalModeSwitch(modeChange, {
      ageYears: getValues("ageYears") as number | null,
      ageValue: getValues("ageValue") as number | null,
      ageUnit: getValues("ageUnit") as string | null,
    }, setValue)
  }
  // Applied as an ordinary edit by this clinician: same form, same validation,
  // same audit. That is what keeps an import off the conflict path entirely.
  for (const [field, value] of Object.entries(patch)) {
    setValue(field, value, { shouldDirty: true })
  }
}
