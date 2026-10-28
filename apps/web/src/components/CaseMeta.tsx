"use client"

import { useState, useRef, useCallback } from "react"
import { useTranslations } from "next-intl"
import { DoorOpen, StickyNote, X } from "lucide-react"

/**
 * The case code, and the notes attached to it.
 *
 * Notes are a write, and the API refuses one from a clinician who has handed
 * the case on, so `canWrite` decides whether this is an editor or a reader.
 * A reader who has notes to read still gets to read them; a reader with none
 * gets no button at all, since an empty read-only box says nothing.
 */
export function CaseMeta({
  caseId,
  caseCode,
  initialNotes,
  canWrite = false,
  theatreName = null,
  cancelled = null,
}: {
  /** A cancelled procedure (10.0.0): its reason, shown as a clear label. */
  cancelled?: { reason: string | null } | null
  caseId: string
  caseCode: string
  initialNotes?: string | null
  canWrite?: boolean
  /** The case's operating theatre (10.0.0), when it has one. */
  theatreName?: string | null
}) {
  const t = useTranslations()
  const [open, setOpen]   = useState(false)
  const [notes, setNotes] = useState(initialNotes ?? "")
  const timerRef          = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveNotes = useCallback((value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value }),
      })
    }, 800)
  }, [caseId])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (!canWrite) return
    setNotes(e.target.value)
    saveNotes(e.target.value)
  }

  const showNotes = canWrite || notes.length > 0

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs tracking-wider text-slate-500 bg-slate-100 dark:bg-[#2a2a2a] dark:text-slate-400 px-2.5 py-1 rounded-md border border-slate-200 dark:border-[#3a3a3a] select-all">
        {caseCode}
      </span>
      {cancelled && (
        <span data-testid="case-cancelled" className="inline-flex items-center text-xs font-bold uppercase tracking-wide text-orange-800 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/40 px-2.5 py-1 rounded-md border border-orange-300 dark:border-orange-800">
          {t("cancellation.label")}{cancelled.reason ? ` · ${cancelled.reason}` : ""}
        </span>
      )}
      {theatreName && (
        <span data-testid="case-theatre" title={t("theatre.label")} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-800">
          <DoorOpen className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">{t("theatre.label")}: </span>{theatreName}
        </span>
      )}
      <div className="relative">
        {showNotes && <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${
            open
              ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700/40 dark:text-amber-400"
              : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-amber-300 hover:text-amber-600 dark:hover:border-amber-700/40 dark:hover:text-amber-400"
          }`}
        >
          <StickyNote className="h-3.5 w-3.5" />
          {t("common.notes").replace(/…$/, "")}
          {notes && !open && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
          )}
        </button>}

        {showNotes && open && (
          <div className="absolute right-0 top-full mt-1.5 z-50 w-72 rounded-lg border border-amber-200 dark:border-amber-700/40 bg-white dark:bg-[#1e1e1e] shadow-lg">
            <div className="flex items-center justify-between px-3 py-2 border-b border-amber-100 dark:border-amber-700/30">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{t("case.caseNotes")}</span>
              <button
                type="button"
                aria-label={t("case.closeCaseNotes")}
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <textarea
              autoFocus={canWrite}
              readOnly={!canWrite}
              rows={4}
              value={notes}
              onChange={handleChange}
              placeholder={canWrite ? t("case.notesNoIdentifiers") : undefined}
              className="w-full text-sm bg-transparent px-3 py-2 outline-none resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600 text-slate-700 dark:text-slate-300"
            />
          </div>
        )}
      </div>
    </div>
  )
}
