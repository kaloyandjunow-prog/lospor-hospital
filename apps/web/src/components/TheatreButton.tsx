"use client"

import { useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Check, ChevronDown, DoorOpen, Loader2 } from "lucide-react"
import type { CaseTheatreView, OperatingTheatre } from "@lospor/core/operating-theatres"
import { serverMessage } from "@/lib/server-message"

/**
 * A case's operating theatre on the dashboard (10.0.0), beside "Assign to".
 * Anyone who can open the case may change it until intraop starts; from then
 * it is shown, not offered. The site's theatres come from Status.
 */
export function TheatreButton({ caseId, theatre, theatres }: {
  caseId: string
  theatre: CaseTheatreView
  theatres: OperatingTheatre[]
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [saving, setSaving] = useState<string | null>(null)
  const [current, setCurrent] = useState<{ id: string | null; name: string | null }>({ id: theatre.id, name: theatre.name })
  const [error, setError] = useState<string | null>(null)
  const [dropPos, setDropPos] = useState({ bottom: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  if (!theatre.changeable) {
    return current.name ? (
      <span title={t("theatre.locked")} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-500 dark:text-slate-400">
        <DoorOpen className="h-3.5 w-3.5" /> {current.name}
      </span>
    ) : null
  }

  const shown = search.trim()
    ? theatres.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()))
    : theatres

  async function choose(theatreId: string | null) {
    setSaving(theatreId ?? "none")
    const res = await fetch(`/api/cases/${caseId}/theatre`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // What this row showed: if someone has changed it since, the server
      // refuses rather than overwriting their choice.
      body: JSON.stringify({ theatreId, expectedTheatreId: current.id }),
    })
    setSaving(null)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (body?.error === "THEATRE_CHANGED") {
        // Show what the case has now, keep the menu open, and say who changed it.
        const now = body.current as { id: string; name: string } | null
        setCurrent({ id: now?.id ?? null, name: now?.name ?? null })
        const theatreName = now?.name ?? t("theatre.none")
        setError(body.changedBy
          ? t("theatre.changedMeanwhileBy", { theatre: theatreName, name: body.changedBy })
          : t("theatre.changedMeanwhile", { theatre: theatreName }))
        router.refresh()
        return
      }
      setError(body?.error ? serverMessage(body.error) : t("theatre.failed"))
      return
    }
    setError(null)
    setCurrent({ id: theatreId, name: theatres.find(item => item.id === theatreId)?.name ?? null })
    setOpen(false)
    setSearch("")
    router.refresh()
  }

  const row = (id: string | null, name: string) => (
    <button key={id ?? "none"} type="button" onClick={() => void choose(id)} disabled={saving !== null}
      className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-lg text-sm transition-colors ${
        current.id === id
          ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
          : "hover:bg-slate-50 dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-slate-300"
      } ${id === null ? "italic" : "font-medium"}`}
    >
      <span className="truncate">{name}</span>
      {saving === (id ?? "none") ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : current.id === id ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
    </button>
  )

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        data-testid="theatre-button"
        onClick={e => {
          e.preventDefault(); e.stopPropagation()
          const r = btnRef.current?.getBoundingClientRect()
          if (r) setDropPos({ bottom: window.innerHeight - r.top + 4, right: window.innerWidth - r.right })
          setOpen(v => !v)
        }}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          current.name
            ? "border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
            : "border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a]"
        }`}
      >
        <DoorOpen className="h-3.5 w-3.5" />
        <span className="max-w-[9rem] truncate">{current.name ?? t("theatre.assign")}</span>
        <ChevronDown className="h-3 w-3 opacity-50" />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(false) }} />
          <div
            data-testid="theatre-menu"
            className="fixed z-[9999] w-64 bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-xl p-3 space-y-2"
            style={{ bottom: dropPos.bottom, right: dropPos.right }}
            onClick={e => { e.preventDefault(); e.stopPropagation() }}
          >
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t("theatre.choose")}</p>
            {theatres.length > 8 && (
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t("theatre.search")}
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] px-3 py-1.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
            <div className="max-h-60 overflow-y-auto space-y-0.5">
              {shown.map(item => row(item.id, item.name))}
              {theatres.length === 0 && <p className="text-xs text-slate-400 text-center py-3">{t("theatre.noneConfigured")}</p>}
              {current.id !== null && row(null, t("theatre.none"))}
            </div>
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <p className="text-[11px] text-slate-400 dark:text-slate-500">{t("theatre.changeableNote")}</p>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
