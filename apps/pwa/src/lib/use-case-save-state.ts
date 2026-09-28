import { createContext, useContext, useEffect, useState } from "react"
import { sameIntraopSaveState, type IntraopSaveInput } from "@lospor/core/intraop-save-state"
import type { CaseSection, RefusedChange } from "@lospor/core/sync"

import { autosaveManager } from "@/lib/autosave-manager"

/**
 * Whether a case's changes have reached the server, per event (9.13.0), from
 * the autosave manager's journals -- the queue itself, not a flag on each
 * event that an edit or a reload could leave behind.
 */
export type CaseSaveState = Omit<IntraopSaveInput, "refused"> & {
  queuedSections: CaseSection[]
  refused: RefusedChange[]
  dismissRefused: () => void
}

const NOTHING: CaseSaveState = {
  queuedEventIds: [],
  sendingEventId: null,
  refused: [],
  queuedSections: [],
  dismissRefused: () => {},
}

export function useCaseSaveState(caseId: string | null | undefined): CaseSaveState {
  const [state, setState] = useState(() => pick(caseId))
  useEffect(() => {
    if (!caseId) return
    setState(current => { const picked = pick(caseId); return sameIntraopSaveState(current, picked) ? current : picked })
    // The queue persists across restarts; read it once on opening the case.
    void autosaveManager.refreshPending(caseId).catch(() => {})
    // Only when something shown changed: the manager reports every step of
    // every save, and a re-render per report stopped the app on opening a
    // case (9.13.0).
    const unsubscribe = autosaveManager.subscribe(next => {
      if (next.caseId !== caseId) return
      const picked = pick(caseId)
      setState(current => sameIntraopSaveState(current, picked) ? current : picked)
    })
    return () => { unsubscribe() }
  }, [caseId])
  return state
}

function pick(caseId: string | null | undefined): CaseSaveState {
  if (!caseId) return NOTHING
  const current = autosaveManager.getState(caseId)
  return {
    queuedEventIds: current.queuedEventIds,
    sendingEventId: current.sendingEventId,
    refused: current.refused,
    queuedSections: current.queuedSections,
    dismissRefused: dismissFor(caseId),
  }
}

// One dismiss function per case, so a reading that changed nothing else is
// the same object and nothing re-renders for it.
const dismissers = new Map<string, () => void>()
function dismissFor(caseId: string): () => void {
  let dismiss = dismissers.get(caseId)
  if (!dismiss) {
    dismiss = () => { void autosaveManager.dismissRefused(caseId).catch(() => {}) }
    dismissers.set(caseId, dismiss)
  }
  return dismiss
}


/** The case's save state for the chart rows, without passing it through every row prop. */
export const CaseSaveStateContext = createContext<CaseSaveState>(NOTHING)

export function useChartSaveState(): CaseSaveState {
  return useContext(CaseSaveStateContext)
}
