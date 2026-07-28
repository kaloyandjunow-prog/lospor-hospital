"use client"

import { useState, useRef, useCallback } from "react"
import { StickyNote, X } from "lucide-react"

export function CaseMeta({
  caseId,
  caseCode,
  initialNotes,
}: {
  caseId: string
  caseCode: string
  initialNotes?: string | null
}) {
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
    setNotes(e.target.value)
    saveNotes(e.target.value)
  }

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs tracking-wider text-slate-500 bg-slate-100 dark:bg-[#2a2a2a] dark:text-slate-400 px-2.5 py-1 rounded-md border border-slate-200 dark:border-[#3a3a3a] select-all">
        {caseCode}
      </span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${
            open
              ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700/40 dark:text-amber-400"
              : "border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400 hover:border-amber-300 hover:text-amber-600 dark:hover:border-amber-700/40 dark:hover:text-amber-400"
          }`}
        >
          <StickyNote className="h-3.5 w-3.5" />
          Notes
          {notes && !open && (
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1.5 z-50 w-72 rounded-lg border border-amber-200 dark:border-amber-700/40 bg-white dark:bg-[#1e1e1e] shadow-lg">
            <div className="flex items-center justify-between px-3 py-2 border-b border-amber-100 dark:border-amber-700/30">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Case notes</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <textarea
              autoFocus
              rows={4}
              value={notes}
              onChange={handleChange}
              placeholder="No patient-identifying information should be entered here"
              className="w-full text-sm bg-transparent px-3 py-2 outline-none resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600 text-slate-700 dark:text-slate-300"
            />
          </div>
        )}
      </div>
    </div>
  )
}
