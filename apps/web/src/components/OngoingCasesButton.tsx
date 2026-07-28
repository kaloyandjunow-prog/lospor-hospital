"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Activity, X, ChevronRight } from "lucide-react"
import { format } from "date-fns"
import { useTranslations } from "next-intl"

type CaseRow = {
  id: string
  status: string
  caseCode: string | null
  createdAt: string
  preop:   { diagnosis: string | null; plannedProcedure: string | null; ageYears: number | null; asaScore: string | null } | null
  intraop: { date: string | null; endTime: string | null } | null
  postop:  { disposition: string | null } | null
}

type StatusKey = "finished" | "awaitingPostop" | "inTheatre" | "awaitingAllocation" | "inConsultation" | "draft"

function computeStatus(c: CaseRow): { key: StatusKey; cls: string } {
  if (c.status === "COMPLETE")
    return { key: "finished",           cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" }
  if (c.intraop?.endTime != null)
    return { key: "awaitingPostop",     cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" }
  if (c.status === "IN_PROGRESS")
    return { key: "inTheatre",          cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" }
  const preopDone = !!(c.preop?.diagnosis && c.preop?.plannedProcedure && c.preop?.asaScore)
  if (preopDone)
    return { key: "awaitingAllocation", cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" }
  if (c.preop?.diagnosis)
    return { key: "inConsultation",     cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" }
  return   { key: "draft",             cls: "bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400" }
}

export function OngoingCasesButton() {
  const t = useTranslations()
  const [open, setOpen]       = useState(false)
  const [cases, setCases]     = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(false)
  const btnRef  = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const router  = useRouter()

  // Fetch on mount to populate the badge count, then refresh when opened
  function fetchCases() {
    setLoading(true)
    fetch("/api/cases")
      .then(r => r.json())
      .then((data: unknown) => {
        // /api/cases returns { cases, total, skip, take }; tolerate a raw array too.
        const rows: CaseRow[] = Array.isArray(data) ? data : ((data as { cases?: CaseRow[] })?.cases ?? [])
        setCases(rows.filter(c => c.status !== "COMPLETE")); setLoading(false)
      })
      .catch(() => setLoading(false))
  }
  // Async fetch-on-mount/open with a loading flag inside fetchCases — standard
  // data-fetching effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchCases() }, [])            // badge count on mount
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) fetchCases() }, [open]) // refresh list on open

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  function navigate(id: string) {
    setOpen(false)
    router.push(`/cases/new?continue=${id}`)
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          open
            ? "bg-slate-100 dark:bg-[#2a2a2a] text-slate-700 dark:text-slate-200"
            : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] active:bg-slate-100 dark:active:bg-[#2a2a2a]"
        }`}>
        <Activity className="h-4 w-4" />
        {t("nav.ongoingCases")}
        {cases.length > 0 && (
          <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-slate-600 dark:bg-slate-400 text-white dark:text-slate-900 text-[9px] font-bold">
            {cases.length}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={dropRef}
          className="absolute top-full right-0 mt-2 w-[440px] max-h-[70vh] overflow-y-auto bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#2e2e2e] rounded-2xl shadow-2xl z-[60]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-[#2a2a2a]">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("nav.ongoingCases")}</p>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {loading && (
            <div className="px-4 py-8 text-center text-sm text-slate-400">{t("common.loading")}</div>
          )}

          {!loading && cases.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-400">{t("status.noOngoing")}</div>
          )}

          {!loading && cases.map(c => {
            const { key, cls } = computeStatus(c)
            const date = c.intraop?.date ?? c.createdAt
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(c.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-50 dark:border-[#252525] hover:bg-slate-50 dark:hover:bg-[#252525] active:bg-slate-50 dark:active:bg-[#252525] transition-colors text-left last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                      {c.preop?.plannedProcedure || t("status.untitled")}
                    </span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${cls}`}>
                      {t(`status.${key}`)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                    {c.preop?.diagnosis ?? "—"}
                    {date && ` · ${format(new Date(date), "dd MMM yyyy")}`}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
