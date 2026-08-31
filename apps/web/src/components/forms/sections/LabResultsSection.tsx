"use client"

import { Controller, type Control } from "react-hook-form"
import { useTranslations } from "next-intl"
import { LabResults, type LabResult } from "@/components/LabResults"
import { SectionCard } from "@/components/forms/PreopFormPresentational"
import type { PreopData } from "@/components/forms/preopSchema"

/**
 * The pre-operative lab panel, lifted out of PreopForm alongside the other
 * section components.
 *
 * aiOptIn is threaded through rather than read here: scanning a lab report
 * sends a photograph of it -- patient name and EGN in the header included -- to
 * an external provider, so the control is gated on the same per-case consent
 * that gates the AI advisor, and the form owns that value.
 */
export function LabResultsSection({
  control,
  aiOptIn,
  caseId,
}: {
  // The concrete form type, not Control<any>: react-hook-form's Control is
  // invariant, so a widened parameter will not accept the caller's control.
  control: Control<PreopData>
  aiOptIn: boolean
  // Scanning is case-scoped, so the server can read consent from the record
  // rather than trusting the request. Null until autosave has created the case.
  caseId?: string | null
}) {
  const t = useTranslations()
  return (
    <SectionCard title={t("preop.labSection")}>
      <Controller name="labResults" control={control} render={({ field }) => (
        <LabResults
          value={(field.value ?? []) as LabResult[]}
          onChange={field.onChange}
          aiOptIn={aiOptIn}
          caseId={caseId}
        />
      )} />
    </SectionCard>
  )
}
