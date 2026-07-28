"use client"

import { useState } from "react"
import { useLocale } from "next-intl"
import Link from "next/link"
import { Search, X, FileText, Printer } from "lucide-react"
import { DeleteDraftButton } from "@/components/DeleteDraftButton"
import { HandoverButton } from "@/components/HandoverButton"
import { format } from "date-fns"
import { displayClinicalCode } from "@/lib/clinical-display"

type CaseRow = {
  id: string
  caseCode: string | null
  status: string
  createdAt: Date
  userId: string
  preop?: { diagnosis?: string | null; plannedProcedure?: string | null; ageYears?: number | null; sex?: string | null; asaScore?: string | null } | null
  intraop?: { monthYear?: string | null; endTime?: string | null; startTime?: string | null } | null
  postop?: { disposition?: string | null } | null
  transfers: { id: string }[]
}

function asaBadge(asa: string | null) {
  if (!asa) return null
  const map: Record<string, string> = { I: "bg-green-100 text-green-800", II: "bg-blue-100 text-blue-800", III: "bg-amber-100 text-amber-800", IV: "bg-red-100 text-red-800", V: "bg-red-200 text-red-900", VI: "bg-slate-200 text-slate-700" }
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${map[asa] ?? ""}`}>ASA {asa}</span>
}

function dispositionBadge(d: string | null, locale: string) {
  if (!d) return null
  const map: Record<string, string> = { WARD: "bg-green-100 text-green-800", PACU: "bg-amber-100 text-amber-800", ICU: "bg-red-100 text-red-800" }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[d] ?? ""}`}>{displayClinicalCode("option:DISPOSITION", d, locale)}</span>
}

type StatusKey = "finished" | "awaitingPostop" | "inTheatre" | "awaitingAllocation" | "inConsultation" | "draft"
function computeStatus(c: CaseRow): { key: StatusKey; cls: string } {
  if (c.status === "COMPLETE") return { key: "finished", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" }
  if (c.intraop?.endTime != null) return { key: "awaitingPostop", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" }
  if (c.status === "IN_PROGRESS") return { key: "inTheatre", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" }
  const preopComplete = !!(c.preop?.diagnosis && c.preop?.plannedProcedure && c.preop?.asaScore)
  if (preopComplete) return { key: "awaitingAllocation", cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" }
  if (c.preop?.diagnosis) return { key: "inConsultation", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" }
  return { key: "draft", cls: "bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400" }
}

const STATUS_CODES: Record<StatusKey, string> = {
  finished: "COMPLETE", awaitingPostop: "AWAITING_POSTOP", inTheatre: "IN_PROGRESS",
  awaitingAllocation: "AWAITING_ALLOCATION", inConsultation: "IN_CONSULTATION", draft: "DRAFT",
}

export function DashboardSearch({
  cases,
  userId,
  role,
}: {
  cases: CaseRow[]
  userId: string
  role: string
}) {
  const locale = useLocale()
  const [query, setQuery] = useState("")

  const filtered = query.trim()
    ? cases.filter(c => {
        const hay = [c.preop?.plannedProcedure, c.preop?.diagnosis, c.caseCode]
          .filter(Boolean).join(" ").toLowerCase()
        return hay.includes(query.trim().toLowerCase())
      })
    : cases

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search procedure, diagnosis or case code…"
          className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#1a1a1a] text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{query ? "No cases match your search" : "No cases here"}</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
          {filtered.map(c => {
            const { key, cls } = computeStatus(c)
            const isComplete = c.status === "COMPLETE"
            const href = isComplete ? `/cases/${c.id}` : `/cases/new?continue=${c.id}`
            return (
              <Link key={c.id} href={href} className="flex items-center justify-between py-3 px-2 hover:bg-slate-100 dark:hover:bg-[#2a2a2a] rounded-lg transition-colors group">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                      {c.preop?.plannedProcedure || "Untitled"}
                    </p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${cls}`}>
                      {displayClinicalCode("caseStatus", STATUS_CODES[key], locale)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 truncate mt-0.5">
                    {c.preop?.diagnosis ?? "—"} · {c.preop?.ageYears ? `${c.preop.ageYears}y` : ""} {c.preop?.sex === "MALE" ? "M" : c.preop?.sex === "FEMALE" ? "F" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  {asaBadge(c.preop?.asaScore ?? null)}
                  {dispositionBadge(c.postop?.disposition ?? null, locale)}
                  {c.caseCode && (
                    <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-[#2a2a2a] px-1.5 py-0.5 rounded">
                      {c.caseCode}
                    </span>
                  )}
                  {!isComplete && <DeleteDraftButton caseId={c.id} />}
                  {isComplete && (
                    <span
                      role="link"
                      tabIndex={0}
                      title="Print case"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); window.location.href = `/cases/${c.id}/print` }}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); window.location.href = `/cases/${c.id}/print` } }}
                      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                    >
                      <Printer className="h-3 w-3" /> Print case
                    </span>
                  )}
                  <HandoverButton
                    caseId={c.id}
                    caseOwnerId={c.userId}
                    sessionUserId={userId}
                    sessionRole={role}
                    hasPendingTransfer={c.transfers.length > 0}
                  />
                  <span className="text-xs text-slate-400">
                    {c.intraop?.monthYear
                      ? (() => { const [y, m] = c.intraop!.monthYear!.split("-"); const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return `${months[parseInt(m,10)-1]} ${y}` })()
                      : format(c.createdAt, "dd MMM yyyy")}
                  </span>
                  <FileText className="h-4 w-4 text-slate-300" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
