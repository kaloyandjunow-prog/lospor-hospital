"use client"

import { EquipmentSuggestions } from "@/components/EquipmentSuggestions"
import type { PreopSummary } from "@/components/forms/preop-summary"

/** Equipment suggestions from the preop assessment: sized for a child, or for an adult when body data is known. */
export function IntraopEquipment({ preop, isPediatric, smart }: {
  preop?: PreopSummary | null
  isPediatric: boolean
  smart: React.ComponentProps<typeof EquipmentSuggestions>["smart"]
}) {
  if (!preop) return null
  const airway = {
    ageYears: preop.ageYears, weightKg: preop.weightKg, heightCm: preop.heightCm, sex: preop.sex, bmi: preop.bmi,
    mallampati: preop.mallampati, neckMobility: preop.neckMobility, mouthOpeningCm: preop.mouthOpeningCm, cormackLehane: preop.cormackLehane,
  }
  if (isPediatric) return <EquipmentSuggestions smart={smart} clinicalMode="PEDIATRIC" ageValue={preop.ageValue} ageUnit={preop.ageUnit} {...airway} />
  if (preop.weightKg || preop.heightCm || preop.ageYears) return <EquipmentSuggestions smart={smart} clinicalMode="ADULT" {...airway} />
  return null
}
