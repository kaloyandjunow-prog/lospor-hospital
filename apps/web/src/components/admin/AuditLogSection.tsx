"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, Download, ScrollText } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import {
  auditActionLabel,
  parseAuditActionDefinitions,
  type AuditActionDefinition,
} from "@/lib/audit-actions"

type AuditRow = {
  id: string; createdAt: string; action: string; entityId: string; detail: unknown
  user: { name?: string; firstName?: string; lastName?: string; title?: string }
}

type AuditResponse = {
  logs?: AuditRow[]
  total?: number
  page?: number
  pageSize?: number
  actions?: unknown
}

export function AuditLogSection() {
  const t = useTranslations()
  const locale = useLocale()
  const [logs,    setLogs]    = useState<AuditRow[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(0)
  const [action,  setAction]  = useState("")
  const [loading, setLoading] = useState(false)
  const [loaded,  setLoaded]  = useState(false)
  const [actionCatalog, setActionCatalog] = useState<AuditActionDefinition[]>([])

  async function load(p = page, a = action) {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), ...(a ? { action: a } : {}) })
    const res = await fetch(`/api/admin/audit-logs?${params}`)
    const data = await res.json() as AuditResponse
    setLogs(data.logs ?? [])
    setTotal(data.total ?? 0)
    setActionCatalog(parseAuditActionDefinitions(data.actions))
    setPage(p)
    setAction(a)
    setLoaded(true)
    setLoading(false)
  }

  function userName(u: AuditRow["user"]) {
    return [u.title, u.firstName || u.name, u.lastName].filter(Boolean).join(" ") || "—"
  }

  const pageSize = 50
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="bg-white dark:bg-[#1c1c1c] rounded-xl border border-slate-200 dark:border-[#2a2a2a] overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 dark:border-[#2a2a2a] flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t("admin.auditLog")} {loaded && `(${total})`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select value={action} onChange={e => load(0, e.target.value)}
            className="text-xs rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-slate-700 dark:text-slate-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">{t("admin.allActions")}</option>
            {actionCatalog.map(item => (
              <option key={item.code} value={item.code}>
                {auditActionLabel(actionCatalog, item.code, locale)}
              </option>
            ))}
          </select>
          {!loaded && (
            <button onClick={() => load(0)}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-[#2a2a2a] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#333] transition-colors">
              {t("admin.load")}
            </button>
          )}
        </div>
      </div>

      {!loaded ? (
        <div className="py-10 text-center text-slate-400 text-sm">{t("admin.clickToLoad")}</div>
      ) : loading ? (
        <div className="py-10 text-center text-slate-400 animate-pulse text-sm">{t("admin.loading")}</div>
      ) : logs.length === 0 ? (
        <div className="py-10 text-center text-slate-400 text-sm">{t("admin.noEntries")}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-[#161616] text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  {[t("admin.colTime"), t("admin.colUser"), t("admin.colAction"), t("admin.colEntityId"), t("admin.colDetail")].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
                {logs.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-[#1a1a1a] transition-colors">
                    <td className="px-4 py-2.5 text-slate-400 text-xs whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 text-xs">{userName(l.user)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        l.action === "CASE_DELETE" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                        l.action === "AI_ADVISE"   ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
                        "bg-slate-100 text-slate-600 dark:bg-[#2a2a2a] dark:text-slate-400"
                      }`} title={l.action}>{auditActionLabel(actionCatalog, l.action, locale)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-mono text-xs">{l.entityId.slice(0, 12)}…</td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono text-xs max-w-xs truncate">
                      {l.detail ? JSON.stringify(l.detail).slice(0, 80) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-slate-100 dark:border-[#2a2a2a] flex items-center justify-between text-xs text-slate-500">
              <span>{t("admin.pageOf", { page: page + 1, total: totalPages })}</span>
              <div className="flex gap-2">
                <button onClick={() => load(page - 1)} disabled={page === 0}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2a2a2a] disabled:opacity-40 transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => load(page + 1)} disabled={page >= totalPages - 1}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2a2a2a] disabled:opacity-40 transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Research export ─────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#1c1c1c] rounded-xl border border-slate-200 dark:border-[#2a2a2a] overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-[#2a2a2a] flex items-center gap-2">
          <Download className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("admin.researchExport")}</span>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("admin.researchExportDescription")}
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/api/export/omop?format=json"
              download
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> {t("admin.exportJson")}
            </a>
            <a
              href="/api/export/omop?format=csv"
              download
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-slate-50 dark:bg-[#2a2a2a] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#3a3a3a] hover:bg-slate-100 dark:hover:bg-[#333] transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> {t("admin.exportCsv")}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
