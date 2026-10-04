import type { ClinicalMode } from "@lospor/core/pediatric"

/**
 * Switch a case between adult and paediatric mode, with everything that costs.
 *
 * The adult vitals do not mean anything in paediatric mode and the paediatric
 * fasting record does not mean anything in adult mode, so each is cleared on
 * the way across, and AI consent is withdrawn because the clinician consented
 * for a different assessment. The risk scores are derived here rather than
 * stored, so unlike the web form there is nothing to clear for them.
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
    for (const field of ["bpSystolic", "bpDiastolic", "heartRate", "spO2", "temperature", "respiratoryRate"]) {
      setValue(field, undefined, dirty)
    }
    return
  }

  // null, never undefined: undefined is dropped from the patch and the server
  // then keeps the pediatric age it has.
  setValue("ageYears", current.ageValue != null && current.ageUnit === "YEARS" ? current.ageValue : null, dirty)
  setValue("ageValue", null, dirty)
  setValue("ageUnit", null, dirty)
  setValue("pediatricFasting", [], dirty)
  setValue("coldsApplicable", false, dirty)
}

/**
 * The switch as the review row asks for it: flip to whichever mode the case is
 * not currently in.
 *
 * Lives here rather than in the new-case screen because that screen is at its
 * size ratchet, and because the rule it applies is this file's, not the
 * screen's.
 */
export function applyEhrImportToForm(
  patch: Record<string, unknown>,
  modeChange: ClinicalMode | null,
  getValues: (field: string) => unknown,
  setValue: (field: string, value: unknown, options: { shouldDirty: true }) => void,
): void {
  // An imported age that belongs to the other mode switches the case first
  // (1.4.23), with exactly what the Adult / Paediatric toggle does: it clears
  // that mode's vitals and normalises the age. The import is written over it
  // afterwards, so nothing just imported is cleared, and both reach the
  // server in one save, so it never sees the age in the wrong mode.
  if (modeChange) {
    applyClinicalModeSwitch(modeChange, {
      ageYears: getValues("ageYears") as number | null,
      ageValue: getValues("ageValue") as number | null,
      ageUnit: getValues("ageUnit") as string | null,
    }, setValue)
  }
  // Applied as an ordinary edit by this clinician: same form, same
  // validation, same audit. That is what keeps an import off the conflict
  // path on the two clients that have no conflict UI.
  for (const [field, value] of Object.entries(patch)) {
    setValue(field, value, { shouldDirty: true })
  }
}

export function toggleClinicalMode(
  pediatricNow: boolean,
  getValues: (field: string) => unknown,
  setValue: (field: string, value: unknown, options: { shouldDirty: true }) => void,
): void {
  applyClinicalModeSwitch(
    pediatricNow ? "ADULT" : "PEDIATRIC",
    {
      ageYears: getValues("ageYears") as number | null,
      ageValue: getValues("ageValue") as number | null,
      ageUnit: getValues("ageUnit") as string | null,
    },
    setValue,
  )
}
