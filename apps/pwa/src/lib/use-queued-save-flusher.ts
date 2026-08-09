import { useCallback, useEffect, useRef } from "react"
import { AppState } from "react-native"
import { createBackoffPolicy } from "@lospor/core/sync"
import { getQueuedCasePatchSummary } from "./offline-case-patches"
import { autosaveManager, resetAutosaveNetworkBreaker } from "./autosave-manager"
import { getAllLocalCaseDrafts, deleteLocalCaseDraft } from "./local-case-store"
import { buildPreopPayload } from "./preop-payload"
import { apiFetch } from "./api"
import { useLiveRefresh } from "./use-live-refresh"

async function flushLocalCaseDrafts(): Promise<void> {
  const drafts = await getAllLocalCaseDrafts()
  for (const draft of drafts) {
    try {
      // Build the normalised payload (includes derived BMI, RCRI, Apfel, STOP-BANG)
      const preop = buildPreopPayload(draft.formValues)
      if (draft.serverCaseId) {
        const outcome = await autosaveManager.saveSection(draft.serverCaseId, "preop", preop, {
          fullPayload: preop,
          force: true,
        })
        if (outcome.result === "saved" || outcome.result === "queued" || outcome.result === "blocked") {
          await deleteLocalCaseDraft(draft.localId)
        }
        continue
      }
      const res = await apiFetch("/api/cases", {
        method: "POST",
        headers: { "X-Idempotency-Key": draft.localId },
        body: JSON.stringify({
          clinicalMode: draft.formValues.clinicalMode === "PEDIATRIC" ? "PEDIATRIC" : "ADULT",
          preop,
        }),
      })
      if (res.ok) {
        await deleteLocalCaseDraft(draft.localId)
      }
    } catch {
      // Network still offline — leave draft in store, try next cycle
    }
  }
}

export function useQueuedSaveFlusher(enabled: boolean, onChange?: (count: number) => void) {
  const reconciledRef = useRef(false)
  // Backoff while saves keep failing (5s → 15s → 60s windows); the 15s
  // useLiveRefresh tick is the scheduler and runs are skipped inside a window.
  const policyRef = useRef(createBackoffPolicy())
  const nextAllowedAtRef = useRef(0)

  // Coming back to the foreground is a fresh chance: forget the failure
  // streak so the activation-triggered flush isn't skipped by a backoff window.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        policyRef.current.reset()
        nextAllowedAtRef.current = 0
        // The network may well have changed while the app was backgrounded, so
        // the offline cooldown should not outlive the background period.
        resetAutosaveNetworkBreaker()
      }
    })
    return () => sub.remove()
  }, [])

  const flush = useCallback(async () => {
    if (!enabled) return
    if (Date.now() < nextAllowedAtRef.current) return // inside a backoff window
    if (!reconciledRef.current) reconciledRef.current = true
    // Flush local-first offline case drafts (initial creation failed while offline)
    await flushLocalCaseDrafts()
    const before = await getQueuedCasePatchSummary()
    await autosaveManager.flushAll()
    const after = await getQueuedCasePatchSummary()
    const outcome = after.count > 0 ? "failed" : before.count > 0 ? "ok" : "idle"
    const delay = policyRef.current.nextDelay(outcome)
    nextAllowedAtRef.current = outcome === "failed" ? Date.now() + delay : 0
    if (onChange) {
      const summary = await getQueuedCasePatchSummary()
      onChange(summary.count)
    }
  }, [enabled, onChange])

  useLiveRefresh(flush, { enabled, intervalMs: 15_000 })
}
