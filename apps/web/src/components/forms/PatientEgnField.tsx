"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import type { UseFormRegisterReturn } from "react-hook-form"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { egnFieldIssue } from "@/lib/egn-field"

/**
 * The optional ЕГН of a new case. A typo shows here while it is typed, not as
 * an "Invalid request" once the whole preop form is filled; the case still
 * saves without it (see the new-case page), so a wrong ЕГН never blocks the
 * record.
 */
export function PatientEgnField({ registration, value }: { registration: UseFormRegisterReturn; value: string | undefined }) {
  const t = useTranslations("patientReference")
  const locale = useLocale()
  const [left, setLeft] = useState(false)
  const issue = egnFieldIssue(value, left)
  return (
    <div className="space-y-1 pt-2">
      <Label htmlFor="hospital-patient-egn" className="text-xs font-semibold uppercase tracking-wide text-slate-500">ЕГН</Label>
      <Input
        id="hospital-patient-egn"
        autoComplete="off"
        inputMode="numeric"
        maxLength={12}
        aria-invalid={issue ? true : undefined}
        aria-describedby={issue ? "hospital-patient-egn-error" : undefined}
        className={issue ? "border-red-500 focus-visible:ring-red-500" : undefined}
        {...registration}
        onBlur={event => { setLeft(true); return registration.onBlur(event) }}
      />
      {issue ? (
        <p id="hospital-patient-egn-error" role="alert" className="text-xs text-red-500">
          {t(issue === "invalid" ? "egnInvalid" : "egnIncomplete")}
        </p>
      ) : (
        <p className="text-xs text-slate-400">
          {locale === "bg"
            ? "По желание. Свързва постъпванията на същия пациент. Остава в болницата."
            : "Optional. Joins this patient's admissions. Stays in this hospital."}
        </p>
      )}
    </div>
  )
}
