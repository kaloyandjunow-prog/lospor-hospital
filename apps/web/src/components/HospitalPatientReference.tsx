"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type RelinkResult = { ok: true } | { ok: false; error: string }

export function HospitalPatientReference({
  maskedIdentifier,
  onRelink,
  disabled = false,
}: {
  maskedIdentifier: string | null
  onRelink: (patientNumber: string, correctionReason: string) => Promise<RelinkResult>
  disabled?: boolean
}) {
  const t = useTranslations("patientReference")
  const [stage, setStage] = useState<"closed" | "edit" | "confirm">("closed")
  const [patientNumber, setPatientNumber] = useState("")
  const [patientNumberConfirmation, setPatientNumberConfirmation] = useState("")
  const [correctionReason, setCorrectionReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function closeEditor() {
    setStage("closed")
    setPatientNumber("")
    setPatientNumberConfirmation("")
    setCorrectionReason("")
    setError(null)
  }

  function reviewCorrection() {
    if (!patientNumber.trim()) {
      setError(t("required"))
      return
    }
    if (patientNumber !== patientNumberConfirmation) {
      setError(t("mismatch"))
      return
    }
    setError(null)
    setStage("confirm")
  }

  async function confirmCorrection() {
    const nextPatientNumber = patientNumber.trim()
    if (!nextPatientNumber || saving || disabled) return
    if (!correctionReason.trim()) {
      setError(t("reasonRequired"))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await onRelink(nextPatientNumber, correctionReason.trim())
      if (!result.ok) {
        setError(result.error)
        return
      }
      closeEditor()
    } catch {
      setError(t("updateFailed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 max-w-xl rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-[#333] dark:bg-[#181818]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("label")}
        </span>
        {maskedIdentifier ? (
          <code data-testid="masked-patient-identifier" className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {maskedIdentifier}
          </code>
        ) : (
          <span role="status" className="text-xs text-amber-700 dark:text-amber-300">
            {t("unavailable")}
          </span>
        )}
        {stage === "closed" && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            disabled={disabled}
            onClick={() => setStage("edit")}
          >
            {t("correct")}
          </Button>
        )}
      </div>

      {stage === "edit" && (
        <div className="mt-3 space-y-2">
          <Label htmlFor="correct-hospital-patient-number">{t("newNumber")}</Label>
          <Input
            id="correct-hospital-patient-number"
            type="password"
            autoComplete="new-password"
            name="hospital-patient-number-correction"
            maxLength={128}
            disabled={disabled}
            value={patientNumber}
            onChange={event => {
              setPatientNumber(event.target.value)
              if (error) setError(null)
            }}
          />
          <Label htmlFor="confirm-hospital-patient-number">{t("repeatNumber")}</Label>
          <Input
            id="confirm-hospital-patient-number"
            type="password"
            autoComplete="new-password"
            name="hospital-patient-number-confirmation"
            maxLength={128}
            disabled={disabled}
            value={patientNumberConfirmation}
            onChange={event => {
              setPatientNumberConfirmation(event.target.value)
              if (error) setError(null)
            }}
          />
          <p className="text-xs text-slate-500">{t("privacy")}</p>
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={disabled} onClick={reviewCorrection}>{t("review")}</Button>
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={closeEditor}>{t("cancel")}</Button>
          </div>
        </div>
      )}

      {stage === "confirm" && (
        <div className="mt-3 space-y-2" role="alertdialog" aria-labelledby="patient-relink-confirm-title">
          <p id="patient-relink-confirm-title" className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {t("confirmTitle")}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300">{t("confirmBody")}</p>
          <Label htmlFor="patient-relink-reason">{t("reason")}</Label>
          <Input
            id="patient-relink-reason"
            maxLength={500}
            disabled={saving || disabled}
            value={correctionReason}
            onChange={event => {
              setCorrectionReason(event.target.value)
              if (error) setError(null)
            }}
          />
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={saving || disabled} onClick={confirmCorrection}>
              {saving ? t("saving") : t("confirm")}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={saving || disabled} onClick={() => setStage("edit")}>
              {t("back")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={saving || disabled} onClick={closeEditor}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
