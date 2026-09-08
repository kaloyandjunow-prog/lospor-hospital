"use client"

// Global "saves waiting to sync" indicator in the app header. Visible on
// every page whenever the offline tray holds queued saves; disappears the
// moment they drain. Also hosts the app's single outbox flusher mount, and
// — since a queued edit can come back a declined conflict from a background
// flush for a case nobody has open — the app's single conflict-resolution
// modal mount.
import { useEffect, useRef, useState } from "react"
import { CloudOff } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import type { ConflictInfo, CaseSection } from "@lospor/core/sync"
import { caseOutbox, onOutboxChange } from "@/lib/case-outbox"
import { eventOutboxCount, onEventOutboxChange } from "@/lib/event-outbox"
import { onConflictDetected, resolveConflict } from "@/lib/autosave-manager"
import { useOutboxFlusher } from "@/hooks/useOutboxFlusher"
import { ConflictModal } from "@/components/ConflictModal"

type ConflictPrompt = ConflictInfo & { serverValues: Record<string, unknown> }

async function fetchSectionValues(caseId: string, section: CaseSection): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/cases/${caseId}`)
  if (!response.ok) throw new Error(`Could not load case ${caseId} (HTTP ${response.status})`)
  const body = await response.json()
  const sectionValue = body && typeof body === "object" ? (body as Record<string, unknown>)[section] : null
  return sectionValue && typeof sectionValue === "object" ? sectionValue as Record<string, unknown> : {}
}

export function OutboxBadge() {
  const t = useTranslations()
  const [patchCount, setPatchCount] = useState(0)
  const [eventCount, setEventCount] = useState(0)
  const [prompt, setPrompt] = useState<ConflictPrompt | null>(null)
  // Conflicts can arrive faster than the clinician resolves them; queue
  // the rest instead of dropping every one after the first.
  const queueRef = useRef<ConflictInfo[]>([])
  const showingRef = useRef(false)

  const showNext = () => {
    if (showingRef.current) return
    const next = queueRef.current.shift()
    if (!next) return
    showingRef.current = true
    fetchSectionValues(next.caseId, next.section)
      .then((serverValues) => setPrompt({ ...next, serverValues }))
      .catch(() => {
        // Cannot show the diff without the server's side — leave the patch
        // queued; the next background flush will report the same conflict.
        showingRef.current = false
        showNext()
      })
  }

  // The one app-wide flusher: replays both trays on reconnect/focus/backoff
  // rhythm. A discard has no server acknowledgement of its own to show
  // anyone it happened — this toast is that explicit warning, and
  // outbox.droppedPatches() is the durable record behind it.
  useOutboxFlusher((result) => {
    if (result.discarded > 0) toast.error(t("nav.saveDiscarded", { count: result.discarded }))
  })

  useEffect(() => {
    let mounted = true
    caseOutbox.summary().then((s) => { if (mounted) setPatchCount(s.count) }).catch(() => {})
    eventOutboxCount().then((n) => { if (mounted) setEventCount(n) }).catch(() => {})
    const unsubPatches = onOutboxChange((s) => setPatchCount(s.count))
    const unsubEvents = onEventOutboxChange((n) => setEventCount(n))
    const unsubConflicts = onConflictDetected((info) => {
      if (!mounted) return
      // Same case/section already queued or on screen — the newest queued
      // payload supersedes it, no need to prompt twice.
      queueRef.current = queueRef.current.filter((q) => q.caseId !== info.caseId || q.section !== info.section)
      queueRef.current.push(info)
      showNext()
    })
    return () => { mounted = false; unsubPatches(); unsubEvents(); unsubConflicts() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const count = patchCount + eventCount
  return (
    <>
      {count > 0 && (
        <span
          title={t("nav.queuedSavesTitle")}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300"
        >
          <CloudOff className="h-3.5 w-3.5" />
          {t("nav.queuedSaves", { count })}
        </span>
      )}
      {prompt && (
        <ConflictModal
          open
          localValues={prompt.localPayload}
          serverValues={prompt.serverValues}
          onClose={() => {
            setPrompt(null)
            showingRef.current = false
            showNext()
          }}
          onResolve={(merged) => {
            const { caseId, section } = prompt
            resolveConflict(caseId, section, merged)
              .catch(() => {
                // Left queued; the next background flush reports it again.
              })
              .finally(() => {
                setPrompt(null)
                showingRef.current = false
                showNext()
              })
          }}
        />
      )}
    </>
  )
}
