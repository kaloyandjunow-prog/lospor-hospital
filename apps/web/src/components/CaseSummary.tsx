"use client"

import { useEffect, useState } from "react"
import { useLocale } from "next-intl"
import type { CaseDetail } from "@/types/case-detail"
import { FINALIZE_UNDO_WINDOW_MS } from "@/lib/constants"
import { LABELS } from "@/components/case-summary/labels"
import { ReviewBar } from "@/components/case-summary/ReviewBar"
import { caseIsWritable } from "@/lib/case-capabilities"
import { RecordSheets } from "@/components/record/RecordSheets"

import { accessLabel, deviceLabel } from "@/components/case-summary/summary-labels"
export { accessLabel, deviceLabel }

// ── Main Component ────────────────────────────────────────────────────────────
// The case summary and the print sheet are one document, the anaesthesia record
// (components/record). mode="summary" (default) adds the review bar above it;
// mode="print" is the record alone, for the print page. `initialData` lets the
// print page pass a server-fetched case (required for the mobile print-token
// flow, which has no browser session).
export function CaseSummary({ caseId, mode = "summary", initialData }: {
  caseId: string
  mode?: "summary" | "print"
  initialData?: CaseDetail
}) {
  const locale = useLocale()
  const isPrint = mode === "print"
  const L = locale === "bg" ? LABELS.bg : LABELS.en

  const [data,       setData]       = useState<CaseDetail | null>(initialData ?? null)
  const [loading,    setLoading]    = useState(!initialData)
  const [now, setNow] = useState<number>(Date.now)

  useEffect(() => {
    if (initialData) return // print-token flow: server already supplied the case
    let cancelled = false
    async function load() {
      // A summary that cannot be loaded must say so. Swallowing the failure
      // left the page pulsing "Loading…" forever, or — worse, on an error
      // response that still parses as JSON — drew a record out of `{error}`
      // with every clinical field silently blank.
      try {
        const res = await fetch(`/api/cases/${caseId}?deleted=1`)
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const d = await res.json() as CaseDetail | null
        if (!cancelled) { setData(d ?? null); setLoading(false) }
      } catch {
        if (!cancelled) { setData(null); setLoading(false) }
      }
    }
    load()
    const onLive = () => load()
    window.addEventListener("case-live-update", onLive)
    return () => {
      cancelled = true
      window.removeEventListener("case-live-update", onLive)
    }
  }, [caseId, initialData])

  // The undo window closes on its own clock, not on the next navigation: a
  // summary left open past the deadline must stop offering Unfinalize, since
  // the server will refuse it anyway.
  const finalizedAtMs = data?.finalizedAt ? new Date(data.finalizedAt).getTime() : null
  useEffect(() => {
    if (finalizedAtMs == null) return
    const msLeft = finalizedAtMs + FINALIZE_UNDO_WINDOW_MS - Date.now()
    if (msLeft <= 0) return
    const timer = setTimeout(() => setNow(Date.now()), msLeft)
    return () => clearTimeout(timer)
  }, [finalizedAtMs])

  if (loading) return <div className="text-sm text-slate-400 dark:text-slate-500 text-center py-12 animate-pulse">{L.loadingCase}</div>
  if (!data)   return <div className="text-sm text-red-500 text-center py-12">{L.loadFailed}</div>

  // Whether this reader may still write to the case, straight from the API. A creator who handed the case on
  // keeps read and print access and loses write; absent or malformed capabilities read as read-only.
  const canWrite = caseIsWritable(data)

  return (
    <div className="protocol-root space-y-3">
      {/* Review bar — summary mode only. Every write action inside it is gated on the capabilities the case endpoint reported. */}
      {!isPrint && (
        <ReviewBar
          caseId={caseId}
          status={data.status}
          canWrite={canWrite}
          awaitingReviewAt={data.awaitingReviewAt ?? null}
          finalizedAtMs={finalizedAtMs}
          now={now}
          labels={L} readinessCase={data}
          onFinalized={finalizedAt => setData(prev => prev ? { ...prev, status: "COMPLETE", finalizedAt } : prev)}
          onUnfinalized={() => setData(prev => prev ? { ...prev, status: "IN_PROGRESS", finalizedAt: null } : prev)}
        />
      )}
      <RecordSheets data={data} locale={locale} />
    </div>
  )
}
