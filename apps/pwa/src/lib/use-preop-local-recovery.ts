import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react"
import { useRouter } from "expo-router"
import type { UseFormReset } from "react-hook-form"
import type { BlockedSaveIssue } from "@lospor/core/sync"
import { ApiError, apiFetch, apiJson } from "./api"
import { autosaveManager } from "./autosave-manager"
import {
  deleteLocalCaseDraft,
  loadLocalPatientReference,
  loadLocalCaseDraft,
  makeLocalCaseId,
  saveLocalCaseDraft,
  type LocalCaseDraft,
  type LocalDraftOwner,
  type LocalCaseDraftSyncReview,
} from "./local-case-store"
import { localDraftSyncReview, reviewBlockedIssue } from "./local-draft-review"
import { notify } from "./notify"
import { buildClinicalPreopPayload } from "./preop-payload"
import {
  postPreopServerCase,
  type PostPreopServerCaseResult,
} from "./preop-server-create"
import { valuesFromServerPreop, type ServerPreop } from "./preop-server-values"
import { persistServerCreateResult, type NewDraftFlushResult } from "./use-queued-save-flusher"
import type { PreopFormInput } from "./preop-form-schema"
import type { PatientReference } from "./patient-reference"

export type PreopDraftState = "idle" | "saving" | "saved" | "queued" | "blocked"

type ServerCreateSuccess = Extract<PostPreopServerCaseResult, { ok: true }>

type RecoveryOptions = {
  continueId?: string
  initialLocalId?: string
  owner: LocalDraftOwner | null
  reset: UseFormReset<PreopFormInput>
  errorLabel: string
  blockedMessage: (issue: BlockedSaveIssue) => string
  rejectedFieldsMessage: (rejected: { path: string }[]) => string
  setCaseId: Dispatch<SetStateAction<string | null>>
  setPatientReference: Dispatch<SetStateAction<PatientReference | null>>
  setPreopFinalizedAt: Dispatch<SetStateAction<string | null>>
  setPreopCaseStatus: Dispatch<SetStateAction<string | null>>
  setSaveError: Dispatch<SetStateAction<string | null>>
  setBlockedIssue: Dispatch<SetStateAction<BlockedSaveIssue | null>>
  setDraftState: Dispatch<SetStateAction<PreopDraftState>>
}

/**
 * Owns the local recovery identity and the server-linked review lifecycle.
 * Screens receive refs for normal autosave, while all deletion/retention rules
 * stay in one place.
 */
export function usePreopLocalRecovery({
  continueId,
  initialLocalId,
  owner,
  reset,
  errorLabel,
  blockedMessage,
  rejectedFieldsMessage,
  setCaseId,
  setPatientReference,
  setPreopFinalizedAt,
  setPreopCaseStatus,
  setSaveError,
  setBlockedIssue,
  setDraftState,
}: RecoveryOptions) {
  const router = useRouter()
  const localIdRef = useRef<string | null>(initialLocalId ?? null)
  const syncReviewRef = useRef<LocalCaseDraftSyncReview | undefined>(undefined)
  const caseIdRef = useRef<string | null>(null)
  const draftIdRef = useRef<string>(makeLocalCaseId())

  const clearLocalDraft = useCallback(async () => {
    if (localIdRef.current && owner) {
      await deleteLocalCaseDraft(localIdRef.current, owner)
      localIdRef.current = null
    }
    syncReviewRef.current = undefined
  }, [owner])

  const persistLocalDraft = useCallback(async (
    values: PreopFormInput,
    syncReview: LocalCaseDraftSyncReview | undefined = syncReviewRef.current,
  ): Promise<boolean> => {
    if (!owner) {
      const message = "Protected local storage is unavailable for this account"
      setSaveError(message)
      setDraftState("blocked")
      throw new Error(message)
    }
    if (!localIdRef.current) localIdRef.current = makeLocalCaseId()
    const { patientNumber, ...clinicalValues } = values
    const ok = await saveLocalCaseDraft({
      localId: localIdRef.current,
      owner,
      formValues: clinicalValues,
      ...(caseIdRef.current ? { serverCaseId: caseIdRef.current } : { patientNumber }),
      syncReview,
    })
    if (!ok) {
      const message = "Storage error: draft could not be saved locally"
      setSaveError(message)
      setDraftState("blocked")
      throw new Error(message)
    }
    syncReviewRef.current = syncReview
    return true
  }, [owner, setDraftState, setSaveError])

  const reconcileCreatedServerDraft = useCallback(async (
    values: PreopFormInput,
    result: ServerCreateSuccess,
    blocked: BlockedSaveIssue | undefined = result.blocked,
  ): Promise<Exclude<NewDraftFlushResult, "pending">> => {
    if (!owner) throw new Error("Protected local storage is unavailable for this account")
    const localId = localIdRef.current ?? draftIdRef.current
    const review = localDraftSyncReview(blocked, result.rejectedFields)
    syncReviewRef.current = review
    const { patientNumber: _patientNumber, ...clinicalValues } = values
    const draft: LocalCaseDraft = {
      localId,
      owner,
      formValues: clinicalValues,
      hasProtectedPatientReference: false,
      createdAt: new Date().toISOString(),
    }
    const outcome = await persistServerCreateResult(
      draft,
      owner,
      { ...result, ...(blocked ? { blocked } : {}) },
    )
    if (outcome === "needs-review") {
      localIdRef.current = localId
    } else {
      if (localIdRef.current === localId) localIdRef.current = null
      syncReviewRef.current = undefined
    }
    return outcome
  }, [owner])

  const tryCreateServerCase = useCallback(async (values: PreopFormInput): Promise<string | null> => {
    if (!values.patientNumber?.trim()) return null
    if (!owner) return null
    const result = await postPreopServerCase(
      values,
      draftIdRef.current,
      apiFetch,
      owner,
    )
    if (!result) return null
    if (!result.ok) {
      if (result.status != null) console.error("[case-create] REQUEST_REJECTED")
      else console.error("[case-create] NETWORK_FAILED")
      setSaveError(result.message)
      return null
    }

    setSaveError(null)
    caseIdRef.current = result.id
    setCaseId(result.id)
    setPreopCaseStatus("DRAFT")
    setPatientReference(result.patientReference)
    autosaveManager.hydrateSection(
      result.id,
      "preop",
      result.acceptedPayload,
      result.revision ?? result.updatedAt,
    )
    if (result.blocked) {
      const fullPayload = buildClinicalPreopPayload(values)
      const outcome = await autosaveManager.saveSection(result.id, "preop", fullPayload, {
        fullPayload,
      })
      const issue = outcome.blocked ?? result.blocked
      setBlockedIssue(issue)
      setSaveError(blockedMessage(issue))
      await reconcileCreatedServerDraft(values, result, issue)
      setDraftState("blocked")
    } else if ((result.rejectedFields?.length ?? 0) > 0) {
      setBlockedIssue(null)
      setSaveError(rejectedFieldsMessage(result.rejectedFields ?? []))
      await reconcileCreatedServerDraft(values, result)
      setDraftState("blocked")
    } else {
      setBlockedIssue(null)
      await reconcileCreatedServerDraft(values, result)
    }
    return result.id
  }, [
    blockedMessage,
    owner,
    reconcileCreatedServerDraft,
    rejectedFieldsMessage,
    setBlockedIssue,
    setCaseId,
    setPatientReference,
    setPreopCaseStatus,
    setDraftState,
    setSaveError,
  ])

  useEffect(() => {
    if (!continueId) return
    caseIdRef.current = continueId
    setCaseId(continueId)
    const localReviewPromise = initialLocalId && owner
      ? loadLocalCaseDraft(initialLocalId, owner).catch(() => null)
      : Promise.resolve(null)

    autosaveManager.flushCase(continueId).catch(() => {}).then(() => Promise.all([
      apiJson<{
        clinicalMode?: "ADULT" | "PEDIATRIC"
        preop?: ServerPreop
        finalizedAt?: string | null
        status?: string
        patientReference?: PatientReference
      }>(`/api/cases/${continueId}`),
      autosaveManager.outbox.load<Record<string, unknown>>(continueId, "preop").catch(() => null),
      localReviewPromise,
    ]))
      .then(([caseData, queuedPreop, localReviewDraft]) => {
        const preop = caseData.preop ?? {}
        const serverValues = valuesFromServerPreop(
          { ...preop, ...(queuedPreop ?? {}) },
          caseData.clinicalMode,
        ) as PreopFormInput
        const loadedValues = localReviewDraft?.syncReview
          ? { ...serverValues, ...localReviewDraft.formValues } as PreopFormInput
          : serverValues
        autosaveManager.hydrateSection(
          continueId,
          "preop",
          buildClinicalPreopPayload(
            valuesFromServerPreop(preop, caseData.clinicalMode) as PreopFormInput,
          ),
          preop.syncRevision ?? preop.updatedAt ?? null,
        )
        reset(loadedValues)
        syncReviewRef.current = localReviewDraft?.syncReview
        const managerState = autosaveManager.getState(continueId)
        const localReview = localReviewDraft?.syncReview
        const localBlocked = localReview ? reviewBlockedIssue(localReview) : null
        if (localBlocked) {
          setBlockedIssue(localBlocked)
          setSaveError(blockedMessage(localBlocked))
          setDraftState("blocked")
        } else if ((localReview?.rejectedFields?.length ?? 0) > 0) {
          setSaveError(rejectedFieldsMessage(
            localReview?.rejectedFields?.map(path => ({ path })) ?? [],
          ))
          setDraftState("blocked")
        } else if (managerState.status === "blocked" && managerState.blocked) {
          setBlockedIssue(managerState.blocked)
          setSaveError(blockedMessage(managerState.blocked))
          setDraftState("blocked")
        }
        setPreopFinalizedAt(caseData.finalizedAt ?? null)
        setPreopCaseStatus(caseData.status ?? null)
        setPatientReference(caseData.patientReference ?? null)
        if (!initialLocalId && !localReviewDraft?.syncReview) void clearLocalDraft()
      })
      .catch((error: Error) => {
        if (error instanceof ApiError && error.status === 404) {
          caseIdRef.current = null
          setCaseId(null)
          notify(errorLabel, "This draft no longer exists. Returning to the dashboard.")
          router.replace("/(app)")
          return
        }
        notify(errorLabel, error.message ?? "Could not load case.")
      })
  }, [
    blockedMessage,
    clearLocalDraft,
    continueId,
    errorLabel,
    initialLocalId,
    owner,
    rejectedFieldsMessage,
    reset,
    router,
    setBlockedIssue,
    setCaseId,
    setPatientReference,
    setDraftState,
    setPreopCaseStatus,
    setPreopFinalizedAt,
    setSaveError,
  ])

  useEffect(() => {
    if (continueId || !initialLocalId) return
    if (!owner) return
    Promise.all([
      loadLocalCaseDraft(initialLocalId, owner),
      loadLocalPatientReference(initialLocalId, owner),
    ]).then(([draft, patientNumber]) => {
      if (!draft) {
        notify(errorLabel, "This local draft is not available to the signed-in account.")
        router.replace("/(app)")
        return
      }
      if (!draft.serverCaseId && !patientNumber) {
        notify(errorLabel, "The protected patient reference is unavailable. The draft was retained and cannot be opened or sent.")
        router.replace("/(app)")
        return
      }
      syncReviewRef.current = draft.syncReview
      reset({ ...draft.formValues, ...(patientNumber ? { patientNumber } : {}) } as PreopFormInput)
      setDraftState(draft.syncReview ? "blocked" : "queued")
    })
  }, [continueId, errorLabel, initialLocalId, owner, reset, router, setDraftState])

  return {
    caseIdRef,
    clearLocalDraft,
    draftIdRef,
    localIdRef,
    persistLocalDraft,
    reconcileCreatedServerDraft,
    tryCreateServerCase,
  }
}
