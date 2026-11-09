"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PatientDisplay } from "@/lib/hospital-patient-reference"

type RelinkResult = { ok: true } | { ok: false; error: string }

export function HospitalPatientReference({
  maskedIdentifier,
  personMaskedIdentifier = null,
  display = null,
  onAddEgn,
  onRelink,
  disabled = false,
}: {
  maskedIdentifier: string | null
  /** The person's ЕГН, masked, when recorded. */
  personMaskedIdentifier?: string | null
  /** The full ИЗ № and the first six digits of a known ЕГН, while the site shows them. */
  display?: PatientDisplay | null
  /** Present where the site permits ЕГН: lets a saved case get one. */
  onAddEgn?: (nationalId: string) => Promise<RelinkResult>
  onRelink: (patientNumber: string, correctionReason: string) => Promise<RelinkResult>
  disabled?: boolean
}) {
  const [egn, setEgn] = useState("")
  const [egnError, setEgnError] = useState<string | null>(null)
  const [egnSaving, setEgnSaving] = useState(false)
  async function addEgn() {
    if (!onAddEgn || !egn.trim() || egnSaving || disabled) return
    setEgnSaving(true)
    setEgnError(null)
    const result = await onAddEgn(egn.trim()).catch(() => ({ ok: false as const, error: "" }))
    setEgnSaving(false)
    if (result.ok) setEgn("")
    else setEgnError(result.error || null)
  }
  const t = useTranslations("patientReference")
  const tc = useTranslations("case")
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
      {display ? (
        <p data-testid="patient-display" className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
          {display.admissionNumber ? <span>{tc("admissionNumberShort")} <span className="font-mono">{display.admissionNumber}</span></span> : null}
          {display.admissionNumber && display.egnPrefix ? " · " : null}
          {display.egnPrefix ? <span>{tc("egnPrefixShort")} <span className="font-mono">{display.egnPrefix}</span></span> : null}
        </p>
      ) : null}
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

      {personMaskedIdentifier ? (
        <div className="mt-1 flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">ЕГН</span>
          <code data-testid="masked-patient-egn" className="text-sm font-semibold text-slate-700 dark:text-slate-200">{personMaskedIdentifier}</code>
        </div>
      ) : onAddEgn ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Label htmlFor="add-patient-egn" className="text-xs font-semibold uppercase tracking-wide text-slate-500">ЕГН</Label>
          <Input id="add-patient-egn" data-testid="add-patient-egn" className="h-8 w-40" autoComplete="off" inputMode="numeric" maxLength={12}
            disabled={disabled || egnSaving} value={egn} onChange={event => { setEgn(event.target.value); if (egnError) setEgnError(null) }} />
          <Button type="button" size="sm" variant="outline" className="h-8" disabled={disabled || egnSaving || !egn.trim()} onClick={() => void addEgn()}>
            {t("egnAdd")}
          </Button>
          {egnError ? <span role="alert" className="text-xs text-red-500">{egnError}</span> : null}
        </div>
      ) : null}

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
