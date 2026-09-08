import { useEffect, useRef } from "react"
import { useRouter } from "expo-router"
import { ApiError, apiJson } from "@/lib/api"
import { autosaveManager } from "@/lib/autosave-manager"
import { notify } from "@/lib/notify"
import { loadLocalCaseDraft, type LocalDraftOwner } from "@/lib/local-case-store"
import type { usePreferences } from "@/lib/preferences-context"
import type { BlockedSaveIssue } from "@lospor/core/sync"

type Input<TFormValues> = {
  continueId: string | undefined
  localIdParam: string | undefined
  /**
   * Appliance-only. Local drafts are stored per signed-in operator here, so
   * reading one back needs to say whose it is -- an appliance is shared by a
   * whole department, unlike a personal phone.
   */
  draftOwner: LocalDraftOwner
  /** Maps a server preop record into this form's values. */
  valuesFromServerPreop: (preop: Record<string, unknown>, mode?: "ADULT" | "PEDIATRIC") => TFormValues
  buildPreopPayload: (values: TFormValues) => Record<string, unknown>
  blockedMessage: (issue: BlockedSaveIssue) => string
  clearLocalDraft: () => Promise<void> | void
  reset: (values: TFormValues) => void
  caseIdRef: { current: string | null }
  setCaseId: (id: string | null) => void
  setPersistedPediatricRecord: (value: boolean) => void
  setBlockedIssue: (issue: BlockedSaveIssue | null) => void
  setSaveError: (message: string | null) => void
  setDraftState: (state: "idle" | "saving" | "saved" | "queued" | "blocked") => void
  setPreopFinalizedAt: (value: string | null) => void
  setPreopCaseStatus: (value: string | null) => void
  tc: ReturnType<typeof usePreferences>["tc"]
}

/**
 * Reopening a case on the preop screen, from either of the two routes in.
 *
 * `?continue=<id>` is a case the server already has; `?localId=<id>` is a draft
 * that never reached it. Split out of new.tsx because this is a self-contained
 * load-and-hydrate sequence with one genuinely subtle rule in it, and that rule
 * was buried a third of the way down a 1460-line screen.
 *
 * The subtlety: any queued preop patch is flushed *before* the GET. A patch
 * queued by an earlier offline autosave otherwise sits unsent until the
 * background flusher's next tick -- up to 15 seconds -- and the GET would reset
 * the form to the stale pre-edit snapshot in the meantime, silently discarding
 * the clinician's queued edit.
 *
 * Everything but `continueId`/`localIdParam` is read through `latest` rather
 * than listed as a dependency: none of it is memoized by the caller, and this
 * must run once per id change, not once per render.
 */
export function usePreopDraftLoader<TFormValues>(input: Input<TFormValues>) {
  const router = useRouter()
  const latest = useRef({ ...input, router })
  latest.current = { ...input, router }
  const { continueId, localIdParam, draftOwner } = input

  useEffect(() => {
    if (!continueId) return
    const {
      caseIdRef, setCaseId, valuesFromServerPreop, buildPreopPayload, blockedMessage,
      reset, setPersistedPediatricRecord, setBlockedIssue, setSaveError, setDraftState,
      setPreopFinalizedAt, setPreopCaseStatus, clearLocalDraft, tc, router,
    } = latest.current
    caseIdRef.current = continueId
    setCaseId(continueId)
    autosaveManager.flushCase(continueId).catch(() => {}).then(() => Promise.all([
      apiJson<{
        clinicalMode?: "ADULT" | "PEDIATRIC"
        preop?: Record<string, unknown>
        finalizedAt?: string | null
        status?: string
      }>(`/api/cases/${continueId}`),
      autosaveManager.outbox.load<Record<string, unknown>>(continueId, "preop").catch(() => null),
    ]))
      .then(([caseData, queuedPreop]) => {
        const p = caseData.preop ?? {}
        const loadedValues = valuesFromServerPreop({ ...p, ...(queuedPreop ?? {}) }, caseData.clinicalMode)
        autosaveManager.hydrateSection(
          continueId,
          "preop",
          buildPreopPayload(valuesFromServerPreop(p, caseData.clinicalMode)),
          (p.syncRevision as number | undefined) ?? (p.updatedAt as string | undefined) ?? null,
        )
        reset(loadedValues)
        setPersistedPediatricRecord(
          (caseData.clinicalMode ?? (loadedValues as { clinicalMode?: string }).clinicalMode) === "PEDIATRIC",
        )
        const managerState = autosaveManager.getState(continueId)
        if (managerState.status === "blocked" && managerState.blocked) {
          setBlockedIssue(managerState.blocked)
          setSaveError(blockedMessage(managerState.blocked))
          setDraftState("blocked")
        }
        setPreopFinalizedAt(caseData.finalizedAt ?? null)
        setPreopCaseStatus(caseData.status ?? null)
        void clearLocalDraft()
      })
      .catch(async (err: Error) => {
        // A draft the server no longer has is not an error to retry against:
        // send the clinician back rather than leaving them editing nothing.
        if (err instanceof ApiError && err.status === 404) {
          caseIdRef.current = null
          setCaseId(null)
          setPersistedPediatricRecord(false)
          notify(tc("errorLabel"), tc("draftNoLongerExists"))
          router.replace("/(app)")
          return
        }
        notify(tc("errorLabel"), tc("caseLoadFailed"))
      })
  }, [continueId])

  // Restore a local draft silently when opened from the dashboard via ?localId=.
  useEffect(() => {
    if (continueId || !localIdParam) return
    const { reset, setDraftState } = latest.current
    loadLocalCaseDraft(localIdParam, draftOwner).then(draft => {
      if (!draft) return
      reset(draft.formValues as TFormValues)
      setDraftState("queued")
    })
  }, [continueId, localIdParam, draftOwner])
}
