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
  caseStatus?:   string
  hasPendingTransfer?: boolean
  onTransferred?: () => void
}

export function HandoverButton({
  caseId, caseOwnerId, sessionUserId, sessionRole, caseStatus, hasPendingTransfer, onTransferred,
}: Props) {
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
  const [withdrawing, setWithdrawing] = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [dropPos,     setDropPos]     = useState({ bottom: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  // Everyone may hand a case on; the role decides what handing it on *means*.
  //
  // A head of department or an administrator assigns, and the case moves at
  // once. Anyone else asks, and it moves when the recipient accepts. This used
  // to return null for a member, so a registrar finishing a pre-assessment had
  // no way to pass the case to the consultant who would actually anaesthetise
  // it — the handover still happened, just nowhere the register could see.
  //
  // The server enforces the same split; this only decides what to call it.
  const assignsInstantly = sessionRole === "HEAD_OF_DEPT" || sessionRole === "ADMIN"

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

  // A finalized case is an attested record; the server refuses to move one
  // (409). Offering the control anyway meant a clinician could pick a
  // colleague, press the button and have nothing whatsoever happen.
  if (caseStatus === "COMPLETE") return null

  const label = pending
    ? t("transfer.awaitingAcceptance")
    : assignsInstantly ? t("transfer.assign") : t("transfer.handOver")

  // Only the person who sent it may withdraw it, and while a handover is
  // pending nothing has moved, so the sender is still the owner.
  //
  // Without this a head of department, who can see the whole department's
  // cases, was offered "Withdraw" on a handover addressed *to them* — the
  // server correctly refuses (cancel matches on fromUserId), so the button did
  // nothing at all and said nothing about why.
  const canWithdraw = pending && caseOwnerId === sessionUserId

  const filtered = colleagues.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.title.toLowerCase().includes(search.toLowerCase())
  )

  async function withdraw() {
    setWithdrawing(true)
    const res = await fetch(`/api/cases/${caseId}/transfer`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    })
    setWithdrawing(false)
    // Only clear the pending state if the server agreed. Clearing it optimistically
    // would offer the case to a second person while the first request still stood,
    // which the server then refuses -- so the button would lie and the next attempt
    // would fail for a reason the clinician cannot see.
    if (res.ok) {
      setPending(false)
      onTransferred?.()
    }
  }

  async function submit() {
    if (!selected) return
    setSubmitting(true)
    const res = await fetch(`/api/cases/${caseId}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: selected.id }),
    })
    setSubmitting(false)
    // A refusal has to be shown. The server has several — the case is already
    // waiting to be accepted, the recipient is at another hospital, the case is
    // finalized — and every one of them used to land here as nothing happening
    // at all: the panel stayed open, no message, no change. The clinician's
    // only reading is that the button is broken.
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? t("transfer.failed"))
      return
    }
    const data = await res.json()
    setError(null)
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

      {/*
        A handover nobody answers has to be escapable. Offered to a colleague on
        annual leave, it would otherwise sit there forever: the case is still
        the sender's to document, but they cannot offer it to anyone else while
        one request is outstanding. Withdrawing is the way out, and this is the
        only place it is reachable.
      */}
      {canWithdraw && (
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); void withdraw() }}
          disabled={withdrawing}
          className="ml-2 text-xs font-medium text-slate-500 dark:text-slate-400 underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-50"
        >
          {withdrawing ? <Loader2 className="h-3 w-3 animate-spin inline" /> : t("transfer.withdraw")}
        </button>
      )}

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
                {/*
                  Say which of the two this is before it happens. "Assign now"
                  on a button that in fact sends a request would make a
                  clinician believe the case had left their list when it had
                  not — the one misunderstanding that matters here, because the
                  case is still theirs to document until someone accepts it.
                */}
                {error && (
                  <p className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  {assignsInstantly
                    ? t("transfer.instantTransfer", { name: selected.name })
                    : t("transfer.sendRequestNote", { name: selected.name })}
                </p>
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {assignsInstantly ? t("transfer.assignNow") : t("transfer.sendRequestBtn")}
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
