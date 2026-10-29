"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { Ban, Loader2, RotateCcw } from "lucide-react"
import { CANCELLATION_REASONS, MAX_CANCELLATION_NOTE_LENGTH, type CancellationReason } from "@lospor/core/case-cancellation"
import { serverMessage } from "@/lib/server-message"

/**
 * "Procedure cancelled" beside Delete (10.0.0): until the anaesthesia start is
 * set, a case whose operation will not happen is cancelled with a reason
 * rather than deleted. Everything recorded stays; the case is closed and
 * exported with its cancellation. Once anaesthesia has started it stays in
 * place, visibly inactive, saying why.
 */
export function CancelProcedureButton({ caseId, inactive = false }: { caseId: string; inactive?: boolean }) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<CancellationReason | null>(null)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (!reason || (reason === "OTHER" && !note.trim())) return
    setSaving(true)
    const res = await fetch(`/api/cases/${caseId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, ...(note.trim() ? { note: note.trim() } : {}) }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.code === "CANCELLATION_TOO_LATE" ? t("cancellation.tooLate") : body?.error ? serverMessage(body.error) : t("cancellation.failed"))
      return
    }
    setOpen(false)
    router.refresh()
  }

  if (inactive) {
    // aria-disabled rather than disabled: the row is a link, and a click on
    // the greyed button must neither open the case nor do anything else.
    return (
      <button
        type="button"
        data-testid="cancel-procedure"
        aria-disabled="true"
        title={t("cancellation.tooLate")}
        onClick={e => { e.preventDefault(); e.stopPropagation() }}
        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border border-dashed border-slate-200 dark:border-[#3a3a3a] text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-60"
      >
        <Ban className="h-3.5 w-3.5" /> {t("cancellation.button")}
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        data-testid="cancel-procedure"
        onClick={e => { e.preventDefault(); e.stopPropagation(); setError(null); setOpen(true) }}
        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border border-slate-200 dark:border-[#3a3a3a] text-slate-400 dark:text-slate-500 hover:border-orange-300 hover:text-orange-600 dark:hover:border-orange-700 dark:hover:text-orange-400 transition-colors"
      >
        <Ban className="h-3.5 w-3.5" /> {t("cancellation.button")}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="cancel-title" data-testid="cancel-dialog"
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1e1e1e] p-5 shadow-xl space-y-3"
            onClick={e => e.stopPropagation()}>
            <h2 id="cancel-title" className="text-base font-bold text-slate-800 dark:text-slate-100">{t("cancellation.title")}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("cancellation.explain")}</p>
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{t("cancellation.reason")}</legend>
              {CANCELLATION_REASONS.map(item => (
                <label key={item.code} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input type="radio" name="cancel-reason" value={item.code} checked={reason === item.code} onChange={() => setReason(item.code)} />
                  {locale === "bg" ? item.labelBg : item.labelEn}
                </label>
              ))}
            </fieldset>
            <label className="block text-sm text-slate-600 dark:text-slate-300">
              {reason === "OTHER" ? t("cancellation.noteRequired") : t("cancellation.note")}
              <textarea value={note} maxLength={MAX_CANCELLATION_NOTE_LENGTH} onChange={e => setNote(e.target.value)} rows={2}
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] px-3 py-2 text-sm text-slate-800 dark:text-slate-100" />
            </label>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-[#2a2a2a]">{t("common.cancel")}</button>
              <button type="button" data-testid="cancel-confirm" onClick={() => void confirm()} disabled={saving || !reason || (reason === "OTHER" && !note.trim())}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {t("cancellation.confirm")}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/** Undoes a cancellation, for those who can edit the case (10.0.0). */
export function UndoCancellationButton({ caseId }: { caseId: string }) {
  const t = useTranslations()
  const router = useRouter()
  const [stage, setStage] = useState<"idle" | "confirm" | "saving">("idle")
  async function click(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (stage === "idle") { setStage("confirm"); setTimeout(() => setStage(current => current === "confirm" ? "idle" : current), 3000); return }
    if (stage !== "confirm") return
    setStage("saving")
    const res = await fetch(`/api/cases/${caseId}/cancel`, { method: "DELETE" })
    setStage("idle")
    if (res.ok) router.refresh()
  }
  return (
    <button type="button" data-testid="undo-cancellation" onClick={e => void click(e)} disabled={stage === "saving"}
      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${stage === "confirm" ? "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-300" : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-slate-300"}`}>
      <RotateCcw className="h-3.5 w-3.5" /> {stage === "confirm" ? t("cancellation.undoConfirm") : t("cancellation.undo")}
    </button>
  )
}
