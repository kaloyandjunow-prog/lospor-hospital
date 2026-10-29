"use client"

import { useTranslations } from "next-intl"
import type { PremedicationOrders, PremedicationPhase } from "@lospor/core/premedication"
import { PremedicationPicker } from "@/components/intraop/PremedicationPicker"
import { usePremedicationLibrary, type PremedicationPatient } from "@/components/intraop/use-premedication-library"
import { useClinicalRules } from "@/hooks/useClinicalRules"

/**
 * Premedication ordered at the preop visit (1.7.0): the night before surgery
 * and its morning, from the same picker and drug list as the intraoperative
 * record, which starts from this order.
 */
export function PreopPremedicationOrderSection({ patient, value, onChange }: {
  patient: PremedicationPatient
  value: PremedicationOrders
  onChange: (next: PremedicationOrders) => void
}) {
  const t = useTranslations("preop.premedication")
  const library = usePremedicationLibrary(patient)
  const { prospectiveGuidanceEnabled } = useClinicalRules(patient.clinicalMode === "PEDIATRIC" ? "PEDIATRIC" : "ADULT")
  const phase = (key: PremedicationPhase, label: string, testId: string) => (
    <PremedicationPicker
      label={label}
      value={value[key] ?? ""}
      onChange={text => onChange({ ...value, [key]: text })}
      categories={library.premedCategories}
      doses={library.premedDoses}
      annotations={library.premedAnnotations}
      doseForRoute={library.premedDoseForRoute}
      prospectiveGuidanceEnabled={prospectiveGuidanceEnabled}
      allowNotApplicable={false}
      testId={testId}
    />
  )
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="preop-premedication-order">
      {phase("DAY_BEFORE", t("nightBefore"), "preop-premedication-night")}
      {phase("MORNING", t("morningOf"), "preop-premedication-morning")}
    </div>
  )
}
