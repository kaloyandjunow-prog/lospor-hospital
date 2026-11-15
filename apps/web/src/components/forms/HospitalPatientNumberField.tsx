"use client"

import type { UseFormRegisterReturn } from "react-hook-form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { IzYearChoice } from "@/components/IzYearChoice"

/**
 * The ИЗ № of a new case (hospital only), and from 1.9.2 the year it belongs
 * to: the number restarts every January, so for the first 60 days the
 * clinician says which year's number it is.
 */
export function HospitalPatientNumberField({
  registration,
  number,
  year,
  onYearChange,
  locale,
  inputClassName,
  missing,
}: {
  registration: UseFormRegisterReturn
  number: string | undefined
  year: number | undefined
  onYearChange: (year: number | undefined) => void
  locale: "bg" | "en"
  inputClassName?: string
  missing: boolean
}) {
  const bg = locale === "bg"
  return (
    <>
      <Label htmlFor="hospital-patient-number" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {bg ? "Болничен номер на пациента" : "Hospital patient number"} <span className="text-red-500">*</span>
      </Label>
      <Input id="hospital-patient-number" autoComplete="off" maxLength={128} className={inputClassName} {...registration} />
      <p className="text-xs text-slate-400">
        {bg
          ? "Остава в болницата. Към централния регистър се изпраща само псевдоним."
          : "Stays in this hospital. Only a pseudonym is sent to the central registry."}
      </p>
      <IzYearChoice number={number} value={year} onChange={onYearChange} locale={locale} />
      {missing && (
        <p className="text-red-500 text-xs">
          {bg ? "Болничният номер е задължителен." : "Hospital patient number is required."}
        </p>
      )}
    </>
  )
}
