"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { DoorOpen, Stethoscope, X } from "lucide-react"
import type { OperatingTheatre } from "@lospor/core/operating-theatres"

/**
 * The dashboard's two filters (10.0.0): by operating theatre (when the site
 * uses them) and by the anaesthesiologist a case is assigned to. Both are
 * applied by the API, so the counts and the list describe the filtered cases.
 */
export function DashboardFilters({ theatres, theatresEnabled, anaesthesiologists }: {
  theatres: OperatingTheatre[]
  theatresEnabled: boolean
  anaesthesiologists: { id: string; name: string }[]
}) {
  const t = useTranslations()
  const router = useRouter()
  const params = useSearchParams()
  const theatre = params.get("theatre") ?? ""
  const assignee = params.get("assignee") ?? ""

  const go = (key: "theatre" | "assignee", value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete("limit")
    const query = next.toString()
    router.push(query ? `/dashboard?${query}` : "/dashboard")
  }
  const clear = () => {
    const next = new URLSearchParams(params.toString())
    next.delete("theatre")
    next.delete("assignee")
    next.delete("limit")
    const query = next.toString()
    router.push(query ? `/dashboard?${query}` : "/dashboard")
  }

  const select = "rounded-full border px-3 py-1.5 text-sm font-semibold bg-white dark:bg-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-blue-500/50"
  const on = "border-blue-500 text-blue-700 dark:text-blue-300"
  const off = "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"

  return (
    <div data-testid="dashboard-filters" className="flex flex-wrap items-center gap-2">
      {theatresEnabled && (
        <label className="inline-flex items-center gap-1.5">
          <DoorOpen className="h-4 w-4 text-slate-400" aria-hidden />
          <span className="sr-only">{t("dashboard.filterTheatre")}</span>
          <select data-testid="filter-theatre" value={theatre} onChange={e => go("theatre", e.target.value)} className={`${select} ${theatre ? on : off}`}>
            <option value="">{t("dashboard.filterAllTheatres")}</option>
            {theatres.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            <option value="none">{t("dashboard.filterNoTheatre")}</option>
          </select>
        </label>
      )}
      <label className="inline-flex items-center gap-1.5">
        <Stethoscope className="h-4 w-4 text-slate-400" aria-hidden />
        <span className="sr-only">{t("dashboard.filterAnaesthesiologist")}</span>
        <select data-testid="filter-assignee" value={assignee} onChange={e => go("assignee", e.target.value)} className={`${select} ${assignee ? on : off}`}>
          <option value="">{t("dashboard.filterAllAnaesthesiologists")}</option>
          {anaesthesiologists.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {(theatre || assignee) && (
        <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          <X className="h-3.5 w-3.5" /> {t("dashboard.clearFilters")}
        </button>
      )}
    </div>
  )
}
