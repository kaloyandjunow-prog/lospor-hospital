"use client"

import { useCallback, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  readHospitalPatientReference,
  type HospitalPatientReference,
} from "@/lib/hospital-patient-reference"

export function useHospitalPatientReference() {
  const t = useTranslations("patientReference")
  const [reference, setReference] = useState<HospitalPatientReference | null>(null)

  const acceptResponse = useCallback((body: unknown) => {
    const next = readHospitalPatientReference(body)
    setReference(next)
    return next !== null
  }, [])

  const relink = useCallback(async (caseId: string | null, patientNumber: string) => {
    if (!caseId) return { ok: false as const, error: t("updateFailed") }
    try {
      const response = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientNumber }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) return { ok: false as const, error: t("updateFailed") }
      const next = readHospitalPatientReference(body)
      if (!next) return { ok: false as const, error: t("verifyFailed") }
      setReference(next)
      toast.success(t("updated"))
      return { ok: true as const }
    } catch {
      return { ok: false as const, error: t("updateFailed") }
    }
  }, [t])

  return { reference, acceptResponse, relink }
}
