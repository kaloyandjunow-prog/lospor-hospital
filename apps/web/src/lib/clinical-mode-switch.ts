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
