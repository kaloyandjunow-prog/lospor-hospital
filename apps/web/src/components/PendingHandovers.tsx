"use client"

import { useState, useEffect, useCallback } from "react"
import { UserCheck, Check, X, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"

interface PendingTransfer {
  id: string
  caseId: string
  case: {
    caseCode: string | null
    preop: { plannedProcedure: string | null; diagnosis: string | null } | null
  }
  fromUser: { name: string; title: string }
  createdAt: string
}

export function PendingHandovers() {
  const t = useTranslations()
  const [items, setItems]   = useState<PendingTransfer[]>([])
  const [acting, setActing] = useState<Record<string, boolean>>({})

  const load = useCallback(() => {
    fetch("/api/cases/transfers/pending")
      .then(r => r.json())
      .then(d => setItems(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  if (items.length === 0) return null

  async function respond(caseId: string, action: "accept" | "decline") {
    setActing(a => ({ ...a, [caseId]: true }))
    await fetch(`/api/cases/${caseId}/transfer`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })
    setActing(a => ({ ...a, [caseId]: false }))
    load()
    if (action === "accept") window.location.reload()
  }

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <UserCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          {t("transfer.pendingHandovers")}
        </p>
      </div>

      {items.map(item => (
        <div key={item.id} className="flex items-center justify-between gap-4 bg-white dark:bg-[#1c1c1c] rounded-lg px-4 py-3 border border-amber-100 dark:border-amber-800/40">
          <div className="min-w-0">
            <p className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate">
              {item.case.preop?.plannedProcedure || t("status.untitled")}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {item.case.preop?.diagnosis && <span>{item.case.preop.diagnosis} · </span>}
              {t("transfer.from")} <span className="font-medium">{item.fromUser.name}</span>
              {item.case.caseCode && <span className="ml-1 font-mono text-slate-400">#{item.case.caseCode}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => respond(item.caseId, "accept")}
              disabled={acting[item.caseId]}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {acting[item.caseId] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {t("transfer.accept")}
            </button>
            <button
              onClick={() => respond(item.caseId, "decline")}
              disabled={acting[item.caseId]}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a] rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="h-3 w-3" />
              {t("transfer.decline")}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
