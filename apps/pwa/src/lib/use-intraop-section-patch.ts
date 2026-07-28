import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react"

import { autosaveManager } from "@/lib/autosave-manager"
import type { CasePatchResponse, CasePatchResult } from "@/lib/offline-case-patches"
import { createCoalescingBatcher, type CoalescingBatcher } from "@lospor/core/sync"

type SyncState = "saved" | "saving" | "failed" | "offline"

type PatchOutcome = { result: CasePatchResult; response?: CasePatchResponse } | undefined

type UseIntraopSectionPatchArgs = {
  caseId: string
  pendingSaveCountRef: MutableRefObject<number>
  setSyncState: Dispatch<SetStateAction<SyncState>>
  setSyncErrorMessage: Dispatch<SetStateAction<string | null>>
  setLastSavedAt: Dispatch<SetStateAction<string | null>>
}

export function useIntraopSectionPatch({
  caseId,
  pendingSaveCountRef,
  setSyncState,
  setSyncErrorMessage,
  setLastSavedAt,
}: UseIntraopSectionPatchArgs) {
  // Rapid taps (positions, monitoring, techniques, complication toggles) used
  // to fire one PATCH each; the later ones executed with a base timestamp
  // captured at tap time and 409'd against their own predecessor. Two fixes:
  //  1. taps coalesce — one merged PATCH ~500ms after the last tap
  //  2. the base is a THUNK resolved inside the write queue at execution time
  const runSave = useCallback(async (payload: Record<string, unknown>): Promise<PatchOutcome> => {
    try {
      const result = await autosaveManager.saveSection(caseId, "intraop", payload, { partial: true })
      if (result.result === "saved") {
        setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
        setSyncErrorMessage(null)
        setSyncState("saved")
      } else if (result.result === "blocked" && result.blocked) {
        setSyncErrorMessage(result.blocked.message)
        setSyncState("failed")
      } else if (result.result === "queued" || result.result === "failed") {
        setSyncErrorMessage(null)
        setSyncState("offline")
      }
      return result
    } catch (error) {
      setSyncErrorMessage(error instanceof Error ? error.message : null)
      setSyncState("failed")
      return undefined
    }
  }, [caseId, setLastSavedAt, setSyncErrorMessage, setSyncState])

  const runSaveRef = useRef(runSave)
  useEffect(() => { runSaveRef.current = runSave }, [runSave])

  const batcherRef = useRef<CoalescingBatcher<PatchOutcome> | null>(null)
  if (!batcherRef.current) {
    batcherRef.current = createCoalescingBatcher<PatchOutcome>((merged) => runSaveRef.current(merged), 500)
  }

  useEffect(() => () => {
    void batcherRef.current?.flush()?.catch(() => {})
  }, [])

  return useCallback((payload: Record<string, unknown>): Promise<PatchOutcome> => {
    // The badge shows "saving" and live-refresh clobber protection engages
    // from the FIRST tap, even though the request goes out after the settle.
    pendingSaveCountRef.current += 1
    setSyncState("saving")
    // Persist every tap before the 500 ms network coalescing window. Leaving
    // the screen, losing power, or losing connectivity during that window can
    // no longer erase a technique/position selection.
    return autosaveManager.outbox
      .queue(
        caseId,
        "intraop",
        payload,
        autosaveManager.getRevision(caseId, "intraop") ?? undefined,
      )
      .then(() => batcherRef.current!.submit(payload))
      .catch((error) => {
        setSyncErrorMessage(error instanceof Error ? error.message : "Local save failed")
        setSyncState("failed")
        throw error
      })
      .finally(() => {
        pendingSaveCountRef.current -= 1
      })
  }, [caseId, pendingSaveCountRef, setSyncErrorMessage, setSyncState])
}
