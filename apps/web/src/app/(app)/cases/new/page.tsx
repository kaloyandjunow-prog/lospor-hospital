"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { PreopForm, type PreopData } from "@/components/forms/PreopForm"
import { IntraopForm, type IntraopData } from "@/components/forms/IntraopForm"
import { type TimetableData } from "@/components/IntraopTimetable"
import type { LogEvent } from "@/types/timetable"
import type { CaseDetail, CaseDetailPreop, CaseDetailIntraop, CaseDetailPostop } from "@/types/case-detail"
import { PostopForm, type PostopData } from "@/components/forms/PostopForm"
import { CheckCircle2 } from "lucide-react"
import {
  dbPreopToForm,
  dbPostopToForm,
  dbIntraopToForm,
  sectionPayload,
  preopSummaryForIntraop,
} from "./case-record-mapping"
import { FINALIZE_UNDO_WINDOW_MS } from "@/lib/constants"
import { recordEhrDecisions } from "@/lib/ehr-import"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { CaseSummary } from "@/components/CaseSummary"
import { useTour } from "@/context/TourContext"
import { useCaseLock } from "@/hooks/useCaseLock"
import { WatchingBanner } from "@/components/WatchingBanner"
import {
  IDEMPOTENCY_HEADER,
  readBlockedSaveIssue,
  type BlockedSaveIssue,
} from "@lospor/core/sync"
import { onOutboxChange } from "@/lib/case-outbox"
import { autosaveManager } from "@/lib/autosave-manager"
import { blockedSaveMessage, withBlockedPreopRejection } from "@/lib/blocked-save-message"
import { randomId } from "@/lib/random-id"
import { CaseProgress } from "./CaseProgress"
import { CaseEditorHeader, type CaseSaveStatus } from "./CaseEditorHeader"
import { useHospitalPatientReference } from "@/hooks/useHospitalPatientReference"
import { usePreopSubmitGate } from "@/hooks/usePreopSubmitGate"
import { useUnsavedCaseWarning } from "@/hooks/useUnsavedCaseWarning"
import { useRejectedFields } from "@/hooks/useRejectedFields"
import { usePendingCloseCountdown } from "@/hooks/usePendingCloseCountdown"
import { submitCaseForReview, submitForReviewMessage, refetchAwaitingReviewAt } from "@/lib/submit-case-for-review"
import { canProgressAfterSave, type SaveOutcomeKind } from "@lospor/core/save-progression"
import { useCaseEventLog } from "./useCaseEventLog"

type HospitalCaseDetail = CaseDetail & { patientReference?: unknown }

export default function NewCasePage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const STEPS = [t("case.steps.preop"), t("case.steps.intraop"), t("case.steps.postop"), t("case.steps.summary")]

  const { setCurrentFormStep } = useTour()

  const [step, setStep]               = useState(0)
  const [caseId, setCaseId]           = useState<string | null>(null)
  const [preopData, setPreopData]     = useState<PreopData | null>(null)
  const [intraopData, setIntraopData] = useState<IntraopData | null>(null)
  const [timetableDefault, setTimetableDefault] = useState<TimetableData | null>(null)
  const [postopData, setPostopData]   = useState<PostopData | null>(null)
  const [continuedPostopItems, setContinuedPostopItems] = useState<string[]>([])
  const [layoutMode, setLayoutMode]   = useState<"tabs" | "scroll">("scroll")
  const [preopLayout, setPreopLayout] = useState<"tabs" | "scroll">("scroll")
  // 30-minute graceful close window, anchored to the server's awaitingReviewAt
  // (set once, the moment the case reaches AWAITING_REVIEW) rather than a
  // per-browser localStorage timestamp, so this and the case-detail route
  // agree on the same remaining time for the same case.
  const [awaitingReviewAt, setAwaitingReviewAt] = useState<string | null>(null)
  const closeSecsLeft = usePendingCloseCountdown(awaitingReviewAt, null, finaliseCase)

  useEffect(() => {
    // One-time mount sync from localStorage (can't read it during SSR), plus
    // a storage-event listener for cross-tab updates - same pattern as
    // SettingsMenu.tsx/ThemeToggle.tsx.
    /* eslint-disable react-hooks/set-state-in-effect */
    const stored = localStorage.getItem("layoutMode")
    if (stored === "tabs" || stored === "scroll") setLayoutMode(stored)
    const storedPreop = localStorage.getItem("preopLayout")
    if (storedPreop === "tabs" || storedPreop === "scroll") setPreopLayout(storedPreop)
    const handler = (e: StorageEvent) => {
      if (e.key === "layoutMode" && (e.newValue === "tabs" || e.newValue === "scroll"))
        setLayoutMode(e.newValue)
      if (e.key === "preopLayout" && (e.newValue === "tabs" || e.newValue === "scroll"))
        setPreopLayout(e.newValue)
    }
    window.addEventListener("storage", handler)
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => window.removeEventListener("storage", handler)
  }, [])
  const [submitting, setSubmitting]   = useState(false)
  const [saveStatus, setSaveStatus]   = useState<CaseSaveStatus>("idle")
  const [autoSaveErrMsg, setAutoSaveErrMsg] = useState<string | null>(null)
  const [blockedIssue, setBlockedIssue] = useState<BlockedSaveIssue | null>(null)

  const blockedMessage = useCallback((issue: BlockedSaveIssue) => blockedSaveMessage(issue, t), [t])

  const { rejections, noteRejections } = useRejectedFields()
  const [loading, setLoading]         = useState(false)
  const [caseCode, setCaseCode]       = useState<string | null>(null)
  const [preopHasInput, setPreopHasInput] = useState(false)
  const [preopNeedsReview, setPreopNeedsReview] = useState(false)
  const { reference: patientReference, acceptResponse: acceptPatientReference, relink: relinkPatient } = useHospitalPatientReference()
  const { error: preopSubmitError, run: runPreopSubmit } = usePreopSubmitGate(setSubmitting)
  useUnsavedCaseWarning(preopHasInput && (!caseId || preopNeedsReview))
  const markPreopInput = useCallback(() => setPreopHasInput(true), [])
  // Undo finalization state
  const [finalizedCaseId,   setFinalizedCaseId]   = useState<string | null>(null)
  const [undoSecsLeft,      setUndoSecsLeft]       = useState<number | null>(null)
  const [undoExpired,       setUndoExpired]        = useState(false)
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const finalizedAtRef = useRef<number | null>(null)

  const { isWatching, holderName, takeover } = useCaseLock(
    caseId,
    step < 3  // only lock during editing steps, not the summary step
  )

  // The app-wide flusher lives in OutboxBadge (header). Here we only listen:
  // when the tray drains to zero while the pill shows "queued", flip to "saved".
  useEffect(() => {
    return onOutboxChange(({ count }) => {
      if (count === 0) {
        setSaveStatus(s => s === "queued" ? "saved" : s)
        setTimeout(() => setSaveStatus(s => s === "saved" ? "idle" : s), 2000)
      }
    })
  }, [])

  // Sync current form step into TourContext so TourButton and TourManager can react
  useEffect(() => {
    setCurrentFormStep(step)
    return () => setCurrentFormStep(null)
  }, [step, setCurrentFormStep])

  // Refs for synchronous access inside async callbacks
  const caseIdRef  = useRef<string | null>(null)
  const savingRef  = useRef(false)
  const { eventLog, setEventLog, handleDeleteEvent, handleLogEvent, handleLogEventDelete } =
    useCaseEventLog(caseIdRef, t)
  // One idempotency key per form session: a create retried after a network
  // blip (autosave re-fires while caseIdRef is still null) can't double-create.
  const createDraftIdRef = useRef(`web-${randomId()}`)

  // Load existing draft when -continue=<id> is in the URL
  useEffect(() => {
    const continueId = searchParams.get("continue")
    const stepParam  = searchParams.get("step")
    if (!continueId) return
    // Async fetch-on-mount with a loading flag - standard data-fetching effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(`/api/cases/${continueId}`)
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw Object.assign(new Error(body.error ?? `Request failed (${r.status})`), { status: r.status })
        }
        return r.json()
      })
      .then(async (record: HospitalCaseDetail) => {
        if (record.status === "COMPLETE") {
          toast(t("case.caseFinalisedRedirect"))
          router.replace(`/cases/${continueId}`)
          return
        }
        caseIdRef.current = continueId
        setCaseId(continueId)
        acceptPatientReference(record)
        if (record.caseCode) setCaseCode(record.caseCode)
        const [queuedPreop, queuedIntraop, queuedPostop, pendingEvents, pendingMutations] = await Promise.all([
          autosaveManager.outbox.load<Record<string, unknown>>(continueId, "preop").catch(() => null),
          autosaveManager.outbox.load<Record<string, unknown>>(continueId, "intraop").catch(() => null),
          autosaveManager.outbox.load<Record<string, unknown>>(continueId, "postop").catch(() => null),
          autosaveManager.pendingEvents.loadPending<Record<string, unknown> & { id: string }>(continueId).catch(() => []),
          autosaveManager.eventMutations.load(continueId).catch(() => []),
        ])
        if (record.preop) {
          const pinnedProfileVersion = (record as unknown as { preopProfilePin?: { profileVersion?: number | null } }).preopProfilePin?.profileVersion
          const pinnedPreop = { ...record.preop, ...(pinnedProfileVersion == null ? {} : { preopProfileVersion: pinnedProfileVersion }) } as CaseDetailPreop
          const serverForm = dbPreopToForm(pinnedPreop, record.clinicalMode) as PreopData
          autosaveManager.hydrateSection(
            continueId,
            "preop",
            sectionPayload("preop", serverForm),
            record.preop.syncRevision ?? record.preop.updatedAt,
          )
          setPreopData(dbPreopToForm(
            { ...pinnedPreop, ...queuedPreop } as CaseDetailPreop,
            queuedPreop?.clinicalMode === "PEDIATRIC" ? "PEDIATRIC" : record.clinicalMode,
          ) as PreopData)
        }
        if (record.postop) {
          const serverForm = dbPostopToForm(record.postop)
          autosaveManager.hydrateSection(
            continueId,
            "postop",
            sectionPayload("postop", serverForm),
            record.postop.syncRevision ?? record.postop.updatedAt,
          )
          setPostopData(dbPostopToForm({ ...record.postop, ...queuedPostop } as CaseDetailPostop))
        }
        if (record.intraop) {
          const serverForm = dbIntraopToForm(record.intraop) as IntraopData
          autosaveManager.hydrateSection(
            continueId,
            "intraop",
            sectionPayload("intraop", serverForm),
            record.intraop.syncRevision ?? record.intraop.updatedAt,
          )
          setIntraopData(dbIntraopToForm({ ...record.intraop, ...queuedIntraop } as CaseDetailIntraop) as IntraopData)
          // keyEvents must be a non-array object with a "vitals" key - the old
          // Prisma default was "[]" which is an array; skip that gracefully.
          const ke = record.intraop.keyEvents
          if (ke && typeof ke === "object" && !Array.isArray(ke) && "vitals" in (ke as object)) {
            try { setTimetableDefault(ke as TimetableData) } catch {}
          }
          const serverLog = ke && typeof ke === "object" && !Array.isArray(ke) && "log" in (ke as object)
            ? (ke as { log?: unknown }).log
            : []
          let restoredLog: LogEvent[] = [
            ...(pendingEvents as LogEvent[]),
            ...(Array.isArray(serverLog) ? serverLog as LogEvent[] : [])
              .filter((event) => !pendingEvents.some((pending) => pending.id === event.id)),
          ]
          for (const operation of pendingMutations) {
            if (operation.kind === "event.delete") {
              restoredLog = restoredLog.filter((event) => event.id !== operation.eventId)
            } else {
              const event = operation.event as LogEvent
              restoredLog = [event, ...restoredLog.filter((item) => item.id !== operation.eventId)]
            }
          }
          if (restoredLog.length > 0) setEventLog(restoredLog)
        }
        // URL step param wins; fall back to deriving from saved data.
        // `parseInt("abc")` is NaN, and clamping NaN stays NaN — which matched
        // no step at all and rendered an empty page over a real case.
        const derivedStep = record.postop ? 3 : record.intraop ? 1 : 0
        const requestedStep = stepParam ? Number.parseInt(stepParam, 10) : NaN
        const target = Number.isFinite(requestedStep)
          ? Math.max(0, Math.min(3, requestedStep))
          : derivedStep
        setStep(target)
        if (record.status === "AWAITING_REVIEW") setAwaitingReviewAt(record.awaitingReviewAt ?? null)
      })
      .catch((error: Error & { status?: number }) => {
        caseIdRef.current = null
        setCaseId(null)
        if (error.status === 404) {
          toast.error("This draft no longer exists.")
          router.replace("/dashboard")
          return
        }
        toast.error(error.message || t("case.saveFailed"))
      })
      .finally(() => setLoading(false))
    // setEventLog is a useState setter and so has a stable identity, but it now
    // arrives through useCaseEventLog, where the lint rule cannot see that.
  }, [acceptPatientReference, router, searchParams, t, setEventLog])

  useEffect(() => {
    if (!caseId || preopNeedsReview) return
    router.replace(`/cases/new?continue=${caseId}&step=${step}`, { scroll: false })
  }, [step, caseId, preopNeedsReview, router])

  // Cleanup countdowns on unmount
  useEffect(() => () => { if (undoTimerRef.current) clearInterval(undoTimerRef.current) }, [])

  const saveSectionInner = useCallback(async (
    section: "preop" | "intraop" | "postop",
    data: PreopData | IntraopData | PostopData,
    { showToast = false, onError }: { showToast?: boolean; onError?: (msg: string) => void } = {}
  ) => {
    try {
      const payload = sectionPayload(section, data)
      if (!caseIdRef.current) {
        const patientNumber = section === "preop" ? (data as PreopData).patientId?.trim() : undefined
        if (!patientNumber) throw new Error("Hospital patient number is required")
        const acceptedPayload = { ...payload }
        let firstBlocked: BlockedSaveIssue | null = null
        let createdBody: Record<string, unknown> | null = null
        const maxAttempts = Object.keys(payload).length + 1
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const selectedMode = acceptedPayload.clinicalMode === "PEDIATRIC"
            ? "PEDIATRIC"
            : "ADULT"
          const res = await fetch("/api/cases", {
            method: "POST",
            headers: { "Content-Type": "application/json", [IDEMPOTENCY_HEADER]: createDraftIdRef.current },
            body: JSON.stringify({ patientNumber, clinicalMode: selectedMode, preop: acceptedPayload }),

          })
          const body = await res.json().catch(() => ({})) as Record<string, unknown>
          if (res.ok) {
            createdBody = body
            break
          }
          const issue = readBlockedSaveIssue(body)
          if (!issue) throw new Error(
            typeof body.error === "string" ? body.error : `Save failed (HTTP ${res.status})`,
          )
          firstBlocked ??= issue
          const before = Object.keys(acceptedPayload).length
          for (const key of issue.blockedKeys) delete acceptedPayload[key]
          if (Object.keys(acceptedPayload).length === before) throw new Error(issue.message)
        }
        if (!createdBody || typeof createdBody.id !== "string") throw new Error(t("case.saveFailed"))
        const {
          id,
          caseCode: code,
          preopUpdatedAt,
          preopRevision,
        } = createdBody as {
          id: string
          caseCode?: string
          preopUpdatedAt?: string
          preopRevision?: number
        }
        const rejectedCount = noteRejections("preop", createdBody)
        setPreopNeedsReview(true)
        caseIdRef.current = id
        setCaseId(id)
        const patientReferenceVerified = acceptPatientReference(createdBody)
        if (code) setCaseCode(code)
        autosaveManager.hydrateSection(id, "preop", acceptedPayload, preopRevision ?? preopUpdatedAt ?? null)
        if (!patientReferenceVerified) {
          const message = t("patientReference.verifyFailed")
          setAutoSaveErrMsg(message)
          if (showToast) toast.error(message)
          onError?.(message)
          return false
        }
        if (firstBlocked) {
          const outcome = await autosaveManager.saveSection(id, "preop", payload, { fullPayload: payload })
          const issue = outcome.blocked ?? firstBlocked
          const message = blockedMessage(issue)
          setBlockedIssue(issue)
          setAutoSaveErrMsg(message)
          if (showToast) toast.error(message)
          onError?.(message)
          return "blocked" as const
        }
        if (rejectedCount > 0) {
          const message = t("case.correctRejectedFields")
          setAutoSaveErrMsg(message)
          if (showToast) toast.error(message)
          onError?.(message)
          return "blocked" as const
        }
        setPreopNeedsReview(false)
        router.replace(`/cases/new?continue=${id}`, { scroll: false })
      } else {
        const existingCaseId = caseIdRef.current
        const outcome = await autosaveManager.saveSection(existingCaseId, section, payload, {
          fullPayload: payload,
        })
        const rejectedCount = outcome.response ? noteRejections(section, outcome.response) : 0
        if (outcome.result === "blocked" && outcome.blocked) {
          const message = blockedMessage(outcome.blocked)
          setBlockedIssue(outcome.blocked)
          setAutoSaveErrMsg(message)
          if (showToast) toast.error(message)
          onError?.(message)
          return "blocked" as const
        }
        if (rejectedCount > 0) {
          const message = t("case.correctRejectedFields")
          setAutoSaveErrMsg(message)
          if (showToast) toast.error(message)
          onError?.(message)
          return "blocked" as const
        }
        if (outcome.result === "queued" || outcome.result === "failed") {
          if (showToast) toast.info(t("case.savedOffline"))
          return "queued" as const
        }
        if (outcome.result === "empty") throw new Error(t("case.saveFailed"))
      }

      if (showToast) toast.success(
        section === "preop"   ? t("case.preopSaved")   :
        section === "intraop" ? t("case.intraopSaved") : t("case.savedSuccess")
      )
      setBlockedIssue(null)
      if (section === "preop") setPreopNeedsReview(false)
      return true
    } catch (err: unknown) {
      console.error("[case-section] SAVE_FAILED")
      const errMsg = err instanceof Error ? err.message : t("case.saveFailed")
      if (showToast) toast.error(errMsg)
      onError?.(errMsg)
      return false
    }
  }, [acceptPatientReference, t, router, noteRejections, blockedMessage])

  const saveSection = useCallback((
    section: "preop" | "intraop" | "postop",
    data: PreopData | IntraopData | PostopData,
    opts: { showToast?: boolean; onError?: (msg: string) => void } = {}
  ) => caseIdRef.current
    ? saveSectionInner(section, data, opts)
    : autosaveManager.runExclusive("new-case", () => saveSectionInner(section, data, opts)),
  [saveSectionInner])

  // ── Auto-save (debounced, called by each form) ──────────────────────────────
  // Coalescing drain loop: an autosave arriving while one is in flight is
  // remembered (latest payload per section wins) and sent right after —
  // never silently dropped like the old `if (savingRef.current) return`.
  const pendingAutosaveRef = useRef(new Map<"preop" | "intraop" | "postop", PreopData | IntraopData | PostopData>())
  const handleAutoSave = useCallback(async (section: "preop" | "intraop" | "postop", data: PreopData | IntraopData | PostopData) => {
    pendingAutosaveRef.current.set(section, data)
    if (savingRef.current) return // the running drain loop below picks this up
    savingRef.current = true
    setSaveStatus("saving")
    let ok = true
    let queuedAny = false
    let blockedAny = false
    for (;;) {
      const next = pendingAutosaveRef.current.entries().next()
      if (next.done) break
      const [nextSection, nextData] = next.value
      pendingAutosaveRef.current.delete(nextSection)
      const saved = await saveSection(nextSection, nextData, { onError: msg => setAutoSaveErrMsg(msg) })
      if (saved === "queued") queuedAny = true
      else if (saved === "blocked") blockedAny = true
      else ok = saved && ok
    }
    if (ok && !blockedAny) setAutoSaveErrMsg(null)
    setSaveStatus(!ok ? "error" : blockedAny ? "blocked" : queuedAny ? "queued" : "saved")
    savingRef.current = false
    if (ok && !queuedAny) {
      // Fade back to idle after 2s (queued stays visible until it syncs)
      setTimeout(() => setSaveStatus(s => s === "saved" ? "idle" : s), 2000)
    }
  }, [saveSection])

  // Stable references, not inline arrows: PreopForm/IntraopForm/PostopForm each
  // key their debounced-autosave effect on this prop, so a new function
  // identity on every render tears the effect down and rebuilds it -- clearing
  // whatever save was already pending (150ms for a discrete tap, e.g. an ASA
  // score pill) before it can fire. That drops the save silently: the field
  // itself is fine in form state, but nothing was ever attempted, so an
  // offline queue watching for a failed attempt never sees one either.
  const onPreopAutoSave = useCallback((data: PreopData) =>
    !caseIdRef.current && !data.patientId?.trim() ? undefined : handleAutoSave("preop", data),
  [handleAutoSave])
  /**
   * Records an EHR acceptance that happened before the case existed.
   *
   * Accepting is what brings the case into being: the imported age, height
   * and weight are usually the values that make it saveable at all. The
   * form has already flushed them by the time this runs, which creates the
   * case, and caseIdRef carries the new id immediately rather than on the
   * next render -- which is why this lives here and not in the form.
   *
   * A failure here loses the decision record, not the clinical values --
   * those are in the case. The import stays pending and offers them again,
   * where they come back as unchanged.
   */
  const onEhrAcceptedBeforeCase = useCallback(async (importId: string, appliedKeys: string[]) => {
    const id = caseIdRef.current
    if (!id) return
    await recordEhrDecisions(id, importId, appliedKeys, [])
  }, [])

  const onIntraopAutoSave = useCallback((data: IntraopData) =>
    handleAutoSave("intraop", data),
  [handleAutoSave])
  const onPostopAutoSave = useCallback((data: PostopData) =>
    handleAutoSave("postop", data),
  [handleAutoSave])

  /** `saveSection`'s own ad hoc result shape, read as what the shared decision expects. */
  function saveOutcomeKind(saved: Awaited<ReturnType<typeof saveSection>>): SaveOutcomeKind {
    if (saved === true) return "saved"
    if (saved === "queued" || saved === "blocked") return saved
    return "failed"
  }

  // ── Manual submit handlers ───────────────────────────────────────────────────
  // Intraop and postop advance on the shared decision. Preop does not: it goes
  // through this appliance's own submit gate, which is deliberately stricter --
  // a queued preop is refused outright, because opening a case establishes the
  // patient link against the hospital's record number and that has to reach the
  // server before anything is documented against it.
  async function handlePreopSubmit(data: PreopData) {
    setPreopHasInput(true)
    setPreopData(data)
    const accepted = await runPreopSubmit(onError => saveSection("preop", data, { showToast: true, onError }))
    if (!accepted) return
    setStep(1); window.scrollTo(0, 0)
  }

  async function handleIntraopSubmit(data: IntraopData) {
    setIntraopData(data)
    if (!caseIdRef.current) return
    setSubmitting(true)
    const saved = await saveSection("intraop", data, { showToast: true })
    setSubmitting(false)
    const decision = canProgressAfterSave(saveOutcomeKind(saved), { caseExistedBeforeSave: true })
    if (decision.canProgress) { setStep(2); window.scrollTo(0, 0) }
  }

  async function handlePostopSubmit(postopData: PostopData) {
    if (!caseIdRef.current) return
    setSubmitting(true)
    try {
      const saved = await saveSection("postop", postopData, { showToast: true })
      // "blocked" means the server refused the patch: nothing was stored. It is
      // truthy, so it used to fall straight through to the summary and start
      // the countdown that finalises the case — closing a record whose postop
      // the server never accepted. saveSection has already said why; stay on
      // the form that holds the offending field.
      if (saved === "blocked") return
      if (!saved || saved === "queued") throw new Error()
      setPostopData(postopData)
      // See submit-case-for-review.ts for why this, not postop completeness
      // alone, starts the closure countdown, and why a refusal keeps the
      // clinician here rather than advancing to a summary for a case that
      // never left IN_PROGRESS.
      const submitted = await submitCaseForReview(caseIdRef.current)
      if (!submitted.ok) return void toast.error(t(submitForReviewMessage(submitted)))
      setAwaitingReviewAt(submitted.awaitingReviewAt)
      setStep(3); window.scrollTo(0, 0)
    } catch {
      toast.error(t("case.saveFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  async function finaliseCase() {
    const id = caseIdRef.current
    if (!id) return
    try {
      await autosaveManager.flushCase(id)
      await autosaveManager.waitForCase(id)
      if (autosaveManager.getState(id).pending > 0) {
        throw new Error("Pending changes must sync before finalization")
      }
      const res = await fetch(`/api/cases/${id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (!res.ok) throw new Error()
      // Cleared only now the server has confirmed finalization -- clearing it
      // on the request instead of the response hid the countdown even when
      // the request then failed and the case was still AWAITING_REVIEW.
      setAwaitingReviewAt(null)
      // Use server finalizedAt if available, otherwise use current timestamp
      let serverFinalizedAt: number = Date.now()
      try {
        const body = await res.json()
        if (body?.finalizedAt) serverFinalizedAt = new Date(body.finalizedAt).getTime()
      } catch {}
      // Start 5-minute undo countdown
      finalizedAtRef.current = serverFinalizedAt
      const UNDO_WINDOW_SECS = FINALIZE_UNDO_WINDOW_MS / 1000
      const elapsed = Math.floor((Date.now() - serverFinalizedAt) / 1000)
      const remaining = Math.max(0, UNDO_WINDOW_SECS - elapsed)
      setFinalizedCaseId(id)
      setUndoExpired(false)
      setUndoSecsLeft(remaining)
      if (undoTimerRef.current) clearInterval(undoTimerRef.current)
      undoTimerRef.current = setInterval(() => {
        setUndoSecsLeft(s => {
          if (s === null || s <= 1) {
            clearInterval(undoTimerRef.current!)
            undoTimerRef.current = null
            setUndoSecsLeft(null)
            setUndoExpired(false)
            setFinalizedCaseId(null)
            // Navigate to case detail after undo window expires
            router.push(`/cases/${id}`)
            return null
          }
          return s - 1
        })
      }, 1000)
      // Navigate to summary step so user sees the undo banner
      setStep(3)
    } catch {
      toast.error(t("case.couldNotClose"))
    }
  }

  async function handleUndo() {
    const id = finalizedCaseId
    if (!id) return
    if (undoTimerRef.current) { clearInterval(undoTimerRef.current); undoTimerRef.current = null }
    try {
      const res = await fetch(`/api/cases/${id}/unfinalize`, { method: "POST" })
      if (res.status === 403) {
        setUndoExpired(true)
        setUndoSecsLeft(null)
        setFinalizedCaseId(null)
        return
      }
      if (!res.ok) throw new Error()
      // Undo succeeded - restore editing state
      setUndoSecsLeft(null)
      setFinalizedCaseId(null)
      setUndoExpired(false)
      toast.success(t("case.finalizationUndone"))
      // Unfinalize reverts to IN_PROGRESS and clears awaitingReviewAt server-
      // side; it must not be reinstated from a manufactured client timestamp
      // here. Resending postop re-submits through the real readiness check,
      // and the re-fetch below reads back whatever the server decided.
      if (postopData && caseIdRef.current) {
        await saveSection("postop", postopData, {})
        setAwaitingReviewAt(await refetchAwaitingReviewAt(id))
      }
    } catch {
      toast.error("Could not undo finalization. Please try again.")
    }
  }

  const visiblePreopRejections = withBlockedPreopRejection(new Map(rejections.preop ?? []), blockedIssue, blockedMessage)

  return (
    <div className={`${step === 1 ? "max-w-6xl" : step === 3 ? "max-w-[1200px]" : "max-w-4xl"} mx-auto space-y-8 transition-all`}>
      {/* Undo finalization banner - shown for 5 minutes after finalizing */}
      {(undoSecsLeft !== null || undoExpired) && (
        <div className={`no-print rounded-lg border px-4 py-3 flex items-center justify-between gap-3 ${
          undoExpired
            ? "border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#1a1a1a]"
            : "border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-950/20"
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
            {undoExpired ? (
              <span className="text-sm text-slate-600 dark:text-slate-400">Undo window has expired.</span>
            ) : (
              <span className="text-sm text-green-700 dark:text-green-300">
                Case finalized.{" "}
                <span className="font-bold tabular-nums">
                  {String(Math.floor((undoSecsLeft ?? 0) / 60)).padStart(2, "0")}:{String((undoSecsLeft ?? 0) % 60).padStart(2, "0")}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Case is finished — offer the two-page record straight away */}
            {finalizedCaseId && (
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => router.push(`/cases/${finalizedCaseId}/print`)}
              >
                Print case
              </Button>
            )}
            {!undoExpired && undoSecsLeft !== null && (
              <Button
                size="sm"
                variant="outline"
                className="border-green-300 text-green-700 hover:bg-green-100 dark:border-green-600 dark:text-green-300 dark:hover:bg-green-900/40"
                onClick={handleUndo}
              >
                Undo
              </Button>
            )}
          </div>
        </div>
      )}

      {isWatching && <WatchingBanner onTakeover={takeover} holderName={holderName} />}
      <CaseEditorHeader
        caseId={caseId}
        caseCode={caseCode}
        saveStatus={saveStatus}
        saveError={autoSaveErrMsg}
        maskedIdentifier={patientReference?.maskedIdentifier ?? null}
        onPatientRelink={(n, reason) => relinkPatient(caseIdRef.current, n, reason)}
        patientRelinkDisabled={isWatching}
      />

      <CaseProgress
        labels={STEPS}
        currentStep={step}
        caseExists={Boolean(caseId)}
        onStepChange={setStep}
      />

      {/* Compact pending-close banner - visible at steps 0/1/2 while countdown is running */}
      {closeSecsLeft !== null && step < 3 && (
        <div className="no-print rounded-lg border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-sm text-amber-700 dark:text-amber-300">
              {t("case.pendingClose")}{" "}
              <span className="font-bold tabular-nums">
                {String(Math.floor(closeSecsLeft / 60)).padStart(2,"0")}:{String(closeSecsLeft % 60).padStart(2,"0")}
              </span>
            </span>
          </div>
          <Button size="sm" variant="outline"
            className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40"
            onClick={() => setStep(3)}>
            {t("case.backToSummary")}
          </Button>
        </div>
      )}

      <fieldset disabled={isWatching} style={{ border: "none", padding: 0, margin: 0, minWidth: 0 }}>
        {loading && (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <span className="animate-pulse">{t("case.loadingDraft")}</span>
          </div>
        )}

        {!loading && step === 0 && (
          <PreopForm
            rejectedFields={visiblePreopRejections}
            defaultValues={preopData ?? undefined}
            onSubmit={handlePreopSubmit}
            onAutoSave={onPreopAutoSave}
            layoutMode={preopLayout}
            caseId={caseId}
            onEhrAcceptedBeforeCase={onEhrAcceptedBeforeCase}
            submitting={submitting}
            submitError={preopSubmitError}
            onClinicalInput={markPreopInput}
          />
        )}
        {!loading && step === 1 && (
          <IntraopForm
            defaultValues={intraopData ?? undefined}
            defaultTimetable={timetableDefault ?? undefined}
            preop={preopData ? preopSummaryForIntraop(preopData) : null}
            caseStarted={!!(intraopData?.startTime)}
            onSubmit={handleIntraopSubmit}
            onBack={() => setStep(0)}
            onAutoSave={onIntraopAutoSave}
            onPostopContinued={items => setContinuedPostopItems(items)}
            layoutMode={layoutMode}
            eventLog={eventLog}
            onDeleteEvent={handleDeleteEvent}
            onLogEvent={handleLogEvent}
            onLogEventDelete={handleLogEventDelete}
          />
        )}
        {!loading && step === 2 && (
          <PostopForm
            rejectedFields={rejections.postop}
            defaultValues={postopData ?? undefined}
            clinicalMode={preopData?.clinicalMode ?? "ADULT"}
            pediatricAgeYears={preopData?.ageYears}
            onSubmit={handlePostopSubmit}
            onBack={() => setStep(1)}
            submitting={submitting}
            onAutoSave={onPostopAutoSave}
            initialComplicationsText={continuedPostopItems.length > 0 ? `Continued postoperatively: ${continuedPostopItems.join(", ")}` : undefined}
          />
        )}
      </fieldset>

      {/* Step 3: Case summary / protocol preview */}
      {step === 3 && caseId && (
        <div className="space-y-4">
          {/* Graceful close countdown banner - hidden once finalized */}
          {closeSecsLeft !== null && (
          <div className="no-print rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-300">
                  {t("case.pendingClose")}{" "}
                  <span className="font-bold tabular-nums">
                    {String(Math.floor(closeSecsLeft / 60)).padStart(2,"0")}:{String(closeSecsLeft % 60).padStart(2,"0")}
                  </span>
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400">{t("case.pendingCloseHint")}</p>
              </div>
            </div>
            {closeSecsLeft !== null && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-amber-600 dark:text-amber-400">{t("settings.edit")}:</span>
                <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40" onClick={() => setStep(0)}>{t("case.steps.preop")}</Button>
                <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40" onClick={() => setStep(1)}>{t("case.steps.intraop")}</Button>
                <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40" onClick={() => setStep(2)}>{t("case.steps.postop")}</Button>
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => finaliseCase()}>
                  {t("case.closeNow")}
                </Button>
              </div>
            )}
          </div>
          )}

          {/* Case summary - patient name dialog is inside CaseSummary */}
          <div data-tour="summary-print" className="no-print absolute opacity-0 pointer-events-none" aria-hidden />
          <CaseSummary caseId={caseId} />

          {/* Navigation - hidden on print */}
          <div className="no-print flex justify-between items-center pt-2">
            <Button variant="outline" onClick={() => setStep(2)}>{t("case.editPostop")}</Button>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => router.push("/dashboard")}>{t("nav.dashboard")}</Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => router.push(`/cases/${caseId}`)}>
                {t("case.goToCase")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
