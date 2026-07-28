"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { UserCheck, Loader2, Check, ChevronDown } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { displayClinicalCode } from "@/lib/clinical-display"

interface Colleague { id: string; name: string; title: string; role: string }

interface Props {
  caseId:      string
  caseOwnerId: string
  sessionUserId: string
  sessionRole:   string
  hasPendingTransfer?: boolean
  onTransferred?: () => void
}

export function HandoverButton({ caseId, sessionRole, hasPendingTransfer, onTransferred }: Props) {
  const t = useTranslations()
  const locale = useLocale()

  const [open,        setOpen]        = useState(false)
  const [colleagues,  setColleagues]  = useState<Colleague[]>([])
  const [loading,     setLoading]     = useState(false)
  const [search,      setSearch]      = useState("")
  const [selected,    setSelected]    = useState<Colleague | null>(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [done,        setDone]        = useState(false)
  const [pending,     setPending]     = useState(hasPendingTransfer ?? false)
  const [dropPos,     setDropPos]     = useState({ bottom: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const isHOD   = sessionRole === "HEAD_OF_DEPT"
  const isAdmin  = sessionRole === "ADMIN"
  const canInitiate = isHOD || isAdmin

  useEffect(() => {
    if (!open || colleagues.length) return
    // Async fetch-on-open with a loading flag — standard data-fetching effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch("/api/users/colleagues")
      .then(r => r.json())
      .then(d => { setColleagues(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [open, colleagues.length])

  if (!canInitiate) return null

  const label = pending ? t("transfer.awaitingAcceptance") : t("transfer.assign")

  const filtered = colleagues.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.title.toLowerCase().includes(search.toLowerCase())
  )

  async function submit() {
    if (!selected) return
    setSubmitting(true)
    const res = await fetch(`/api/cases/${caseId}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: selected.id }),
    })
    setSubmitting(false)
    if (res.ok) {
      const data = await res.json()
      setOpen(false)
      setSelected(null)
      setSearch("")
      if (data.instant) {
        setDone(true)
        onTransferred?.()
      } else {
        setPending(true)
      }
    }
  }

  if (done) return (
    <span className="inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
      <Check className="h-3.5 w-3.5" />
      {t("transfer.transferred")}
    </span>
  )

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={e => {
          e.preventDefault(); e.stopPropagation()
          if (!pending) {
            const r = btnRef.current?.getBoundingClientRect()
            if (r) setDropPos({ bottom: window.innerHeight - r.top + 4, right: window.innerWidth - r.right })
            setOpen(v => !v)
          }
        }}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors
          ${pending
            ? "border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 cursor-default"
            : "border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#2a2a2a]"
          }`}
      >
        <UserCheck className="h-3.5 w-3.5" />
        {label}
        {!pending && <ChevronDown className="h-3 w-3 opacity-50" />}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(false) }} />
          <div
            className="fixed z-[9999] w-72 bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-[#3a3a3a] rounded-xl shadow-xl p-3 space-y-2"
            style={{ bottom: dropPos.bottom, right: dropPos.right }}
            onClick={e => { e.preventDefault(); e.stopPropagation() }}
          >
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {t("transfer.selectColleague")}
            </p>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("transfer.search")}
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] px-3 py-1.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {loading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                </div>
              )}
              {!loading && filtered.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-3">
                  {t("transfer.noColleagues")}
                </p>
              )}
              {filtered.map(c => (
                <button key={c.id} onClick={() => setSelected(c)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors
                    ${selected?.id === c.id
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "hover:bg-slate-50 dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-slate-300"
                    }`}
                >
                  <span className="font-medium">{c.name}</span>
                  {c.title && <span className="text-slate-400 dark:text-slate-500 ml-1 text-xs">{c.title}</span>}
                  {c.role !== "MEMBER" && (
                    <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                      {displayClinicalCode("userRole", c.role, locale)}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {selected && (
              <div className="pt-1 border-t border-slate-100 dark:border-[#2a2a2a]">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  {t("transfer.instantTransfer", { name: selected.name })}
                </p>
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t("transfer.assignNow")}
                </button>
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
