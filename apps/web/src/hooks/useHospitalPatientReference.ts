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

  // Correcting which patient a case belongs to is no longer part of the case
  // save. It used to ride along in a PATCH with no expected previous link and
  // no stated reason, so two people correcting the same case both succeeded and
  // the last one won, recorded only as "case updated". It has its own endpoint
  // now, which has to be told what the caller believed the link was.
  const relink = useCallback(async (
    caseId: string | null,
    patientNumber: string,
    correctionReason: string,
  ) => {
    if (!caseId || !reference?.id) return { ok: false as const, error: t("updateFailed") }
    try {
      const response = await fetch(`/api/cases/${caseId}/patient-link/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedPatientLinkId: reference.id,
          newPatientNumber: patientNumber,
          correctionReason,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        // A 409 means someone else moved the link while this form was open.
        // Reporting that is the point of the precondition; a generic failure
        // would hide the one case it exists to catch.
        return {
          ok: false as const,
          error: t(response.status === 409 ? "changedElsewhere" : "updateFailed"),
        }
      }
      const next = readHospitalPatientReference(body)
      if (!next) return { ok: false as const, error: t("verifyFailed") }
      setReference(next)
      toast.success(t("updated"))
      return { ok: true as const }
    } catch {
      return { ok: false as const, error: t("updateFailed") }
    }
  }, [reference, t])

  // The ЕГН of a saved case: it only fills a gap, so the server refuses to
  // replace one already recorded (that is an administrator's correction).
  const addEgn = useCallback(async (caseId: string | null, nationalId: string) => {
    if (!caseId || !reference) return { ok: false as const, error: t("updateFailed") }
    try {
      const response = await fetch(`/api/cases/${caseId}/patient-link/person`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nationalId }),
      })
      const body = await response.json().catch(() => ({})) as { code?: string; personMaskedIdentifier?: unknown }
      if (!response.ok) {
        const key = body.code === "INVALID_EGN" ? "egnInvalid" : response.status === 409 ? "egnTaken" : "updateFailed"
        return { ok: false as const, error: t(key) }
      }
      const masked = typeof body.personMaskedIdentifier === "string" && body.personMaskedIdentifier.includes("*") ? body.personMaskedIdentifier : null
      setReference(current => current ? { ...current, personMaskedIdentifier: masked } : current)
      toast.success(t("egnAdded"))
      return { ok: true as const }
    } catch {
      return { ok: false as const, error: t("updateFailed") }
    }
  }, [reference, t])

  return { reference, acceptResponse, relink, addEgn }
}
