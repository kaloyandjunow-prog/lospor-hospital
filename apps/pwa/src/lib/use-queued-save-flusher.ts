import { useCallback, useEffect, useRef } from "react"
import { AppState } from "react-native"
import { createBackoffPolicy } from "@lospor/core/sync"
import { getQueuedCasePatchSummary } from "./offline-case-patches"
import { autosaveManager, resetAutosaveNetworkBreaker } from "./autosave-manager"
import {
  getAllLocalCaseDrafts,
  deleteLocalCaseDraft,
  loadLocalPatientReference,
  saveLocalCaseDraft,
  sameLocalDraftOwner,
} from "./local-case-store"
import { buildPreopPayload } from "./preop-payload"
import { apiFetch } from "./api"
import type { ApiRequestInit } from "./api"
import { isPreopFormOpen } from "./preop-open-forms"
import { useLiveRefresh } from "./use-live-refresh"
import { postPreopServerCase } from "./preop-server-create"
import { localDraftSyncReview } from "./local-draft-review"
import type {
  LocalCaseDraft,
  LocalDraftOwner,
  SaveLocalCaseDraftInput,
} from "./local-case-store"
import type { PreopFormInput } from "./preop-form-schema"
import type { PostPreopServerCaseResult } from "./preop-server-create"

type CaseCreator = (path: string, init?: ApiRequestInit) => Promise<Response>

export async function createServerCaseFromLocalDraft(
  draft: LocalCaseDraft,
  owner: LocalDraftOwner,
  fetcher: CaseCreator = apiFetch,
  referenceLoader: typeof loadLocalPatientReference = loadLocalPatientReference,
): Promise<PostPreopServerCaseResult | null> {
  if (!sameLocalDraftOwner(draft.owner, owner)) return null
  const patientNumber = await referenceLoader(draft.localId, owner)
  if (!patientNumber) return null
  return postPreopServerCase(
    { ...draft.formValues, patientNumber } as PreopFormInput,
    draft.localId,
    fetcher,
    owner,
  )
}

type NewDraftFlushDependencies = {
  fetcher?: CaseCreator
  referenceLoader?: typeof loadLocalPatientReference
  removeDraft?: (localId: string, owner: LocalDraftOwner) => Promise<void>
  storeDraft?: (input: SaveLocalCaseDraftInput) => Promise<boolean>
}

export type NewDraftFlushResult = "accepted" | "needs-review" | "pending"

export async function persistServerCreateResult(
  draft: LocalCaseDraft,
  owner: LocalDraftOwner,
  result: Extract<PostPreopServerCaseResult, { ok: true }>,
  dependencies: Pick<NewDraftFlushDependencies, "removeDraft" | "storeDraft"> = {},
): Promise<Exclude<NewDraftFlushResult, "pending">> {
  if (!sameLocalDraftOwner(draft.owner, owner)) return "needs-review"
  const review = localDraftSyncReview(result.blocked, result.rejectedFields)
  if (review) {
    const stored = await (dependencies.storeDraft ?? saveLocalCaseDraft)({
      localId: draft.localId,
      owner,
      formValues: draft.formValues,
      serverCaseId: result.id,
      syncReview: review,
    })
    if (!stored) {
      throw new Error("The server needs a review, but the local recovery copy could not be saved.")
    }
    return "needs-review"
  }

  await (dependencies.removeDraft ?? deleteLocalCaseDraft)(draft.localId, owner)
  return "accepted"
}

/**
 * Reconcile one local-only draft without collapsing partial acceptance into
 * success. Values that need review remain in the local copy and that copy is
 * tied to the newly-created server case.
 */
export async function flushNewLocalCaseDraft(
  draft: LocalCaseDraft,
  owner: LocalDraftOwner,
  dependencies: NewDraftFlushDependencies = {},
): Promise<NewDraftFlushResult> {
  if (!sameLocalDraftOwner(draft.owner, owner)) return "pending"
  const result = await createServerCaseFromLocalDraft(
    draft,
    owner,
    dependencies.fetcher ?? apiFetch,
    dependencies.referenceLoader ?? loadLocalPatientReference,
  )
  if (!result?.ok) return "pending"

  return persistServerCreateResult(draft, owner, result, dependencies)
}

function clinicalPreopPayload(formValues: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...buildPreopPayload(formValues) } as Record<string, unknown>
  // Patient numbers belong to PatientLink/the create envelope, never clinical
  // JSON sent in a PATCH for a case that is already linked.
  delete payload.patientNumber
  return payload
}

export async function flushLocalCaseDrafts(owner: LocalDraftOwner): Promise<void> {
  const drafts = await getAllLocalCaseDrafts(owner)
  for (const draft of drafts) {
    try {
      // A partial create needs a clinician decision. Replaying the unchanged
      // value in the background could turn another partial response into a
      // false success, so the recovery copy is left untouched.
      if (draft.syncReview) continue

      if (draft.serverCaseId) {
        // The open form saves this case and clears the draft itself; a replay
        // racing its newer save could land last with older values.
        if (isPreopFormOpen(draft.serverCaseId)) continue
        const preop = clinicalPreopPayload(draft.formValues)
        const outcome = await autosaveManager.saveSection(draft.serverCaseId, "preop", preop, {
          fullPayload: preop,
          force: true,
        })
        const review = localDraftSyncReview(outcome.blocked, outcome.response?.rejectedFields)
        if (review) {
          await saveLocalCaseDraft({
            localId: draft.localId,
            owner,
            formValues: draft.formValues,
            serverCaseId: draft.serverCaseId,
            syncReview: review,
          })
        } else if (outcome.result === "saved" || outcome.result === "queued") {
          await deleteLocalCaseDraft(draft.localId, owner)
        }
        continue
      }
      await flushNewLocalCaseDraft(draft, owner)
    } catch {
      // Network still offline — leave draft in store, try next cycle
    }
  }
}

export function useQueuedSaveFlusher(
  enabled: boolean,
  owner: LocalDraftOwner | null,
  onChange?: (count: number) => void,
) {
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
    if (!enabled || !owner) return
    if (Date.now() < nextAllowedAtRef.current) return // inside a backoff window
    if (!reconciledRef.current) reconciledRef.current = true
    // Flush local-first offline case drafts (initial creation failed while offline)
    await flushLocalCaseDrafts(owner)
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
  }, [enabled, onChange, owner])

  // immediate: becoming enabled (sign-in, or a fresh launch that already has
  // queued work) is itself a reason to try right away, not leave clinical
  // work queued for up to 15s with nothing actually wrong.
  useLiveRefresh(flush, { enabled, intervalMs: 15_000, immediate: true })
}
