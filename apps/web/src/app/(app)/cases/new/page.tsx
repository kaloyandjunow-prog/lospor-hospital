"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Progress } from "@/components/ui/progress"
import { PreopForm, type PreopData } from "@/components/forms/PreopForm"
import { IntraopForm, type IntraopData } from "@/components/forms/IntraopForm"
import { type TimetableData } from "@/components/IntraopTimetable"
import type { LogEvent } from "@/types/timetable"
import type { CaseDetail, CaseDetailPreop, CaseDetailIntraop, CaseDetailPostop } from "@/types/case-detail"
import { PostopForm, type PostopData } from "@/components/forms/PostopForm"
import { UserRound, CheckCircle2 } from "lucide-react"
import { CaseMeta } from "@/components/CaseMeta"
import { calcBMI } from "@/lib/scores"
import { localTimeOf } from "@/lib/intraop-time"
import { readRejectedFields, rejectionsForSection, rejectionMessages } from "@/lib/rejected-fields"
import { FINALIZE_UNDO_WINDOW_MS } from "@/lib/constants"
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
import { randomId } from "@/lib/random-id"
import { INTRAOP_RESUME_WINDOW_SECONDS } from "@lospor/core/intraop-engine"

type SaveStatus = "idle" | "saving" | "saved" | "queued" | "blocked" | "error"

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
  const [eventLog, setEventLog] = useState<LogEvent[]>([])

  async function handleDeleteEvent(evId: string) {
    const currentCaseId = caseIdRef.current
    if (!currentCaseId) return
    setEventLog(prev => prev.filter(e => e.id !== evId))
    try {
      await autosaveManager.stageEventMutation({
        operationId: `web-delete-${randomId()}`,
        caseId: currentCaseId,
        kind: "event.delete",
        eventId: evId,
        baseRevision: autosaveManager.getRevision(currentCaseId, "intraop"),
        queuedAt: new Date().toISOString(),
      })
    } catch {
      toast.error(t("case.timelineEditFailed"))
    }
  }

  async function handleLogEvent(event: LogEvent) {
    const currentCaseId = caseIdRef.current
    if (!currentCaseId) return
    const durableEvent = { ...event, id: event.id ?? randomId() }
    const replacesExisting = eventLog.some((item) => item.id === durableEvent.id)
    setEventLog(prev => [durableEvent, ...prev.filter(e => e.id !== durableEvent.id)])
    try {
      if (replacesExisting) {
        await autosaveManager.stageEventMutation({
          operationId: `web-upsert-${randomId()}`,
          caseId: currentCaseId,
          kind: "event.upsert",
          eventId: durableEvent.id,
          event: durableEvent as Record<string, unknown>,
          baseRevision: autosaveManager.getRevision(currentCaseId, "intraop"),
          queuedAt: new Date().toISOString(),
        })
      } else {
        await autosaveManager.appendEvent(currentCaseId, durableEvent as Record<string, unknown> & { id: string })
      }
    } catch (error) {
      console.error("[intraop event] journal failed", error)
      toast.error(t("case.timelineEditFailed"))
    }
  }

  async function handleLogEventDelete(match: { infId?: string; fluidId?: string }) {
    if (!caseIdRef.current) return
    const key = match.infId ? "infId" : "fluidId"
    const value = match.infId ?? match.fluidId
    if (!value) return
    const newLog = eventLog.filter(e => e[key] !== value)
    if (newLog.length === eventLog.length) return
    const removed = eventLog.filter(e => e[key] === value && e.id)
    setEventLog(newLog)
    try {
      for (const event of removed) {
        await autosaveManager.stageEventMutation({
          operationId: `web-delete-${randomId()}`,
          caseId: caseIdRef.current,
          kind: "event.delete",
          eventId: event.id!,
          baseRevision: autosaveManager.getRevision(caseIdRef.current, "intraop"),
          queuedAt: new Date().toISOString(),
        })
      }
    } catch {
      toast.error(t("case.timelineEditFailed"))
    }
  }
  const [postopData, setPostopData]   = useState<PostopData | null>(null)
  const [continuedPostopItems, setContinuedPostopItems] = useState<string[]>([])
  const [layoutMode, setLayoutMode]   = useState<"tabs" | "scroll">("scroll")
  const [preopLayout, setPreopLayout] = useState<"tabs" | "scroll">("scroll")
  // 30-minute graceful close window (seconds remaining; null = not started)
  const [closeSecsLeft, setCloseSecsLeft] = useState<number | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
  const [saveStatus, setSaveStatus]   = useState<SaveStatus>("idle")
  const [autoSaveErrMsg, setAutoSaveErrMsg] = useState<string | null>(null)
  const [blockedIssue, setBlockedIssue] = useState<BlockedSaveIssue | null>(null)

  const blockedMessage = useCallback((issue: BlockedSaveIssue) => {
    const field = (() => {
      switch (issue.field) {
        case "diagnosis":
        case "diagnoses": return t("preop.diagnosis")
        case "plannedProcedure":
        case "procedures": return t("preop.procedure")
        case "comorbidities": return t("preop.historySection")
        case "teamNotes": return t("preop.teamNotes")
        case "allergyDetails": return t("preop.allergies")
        case "currentMedications": return t("preop.medicationsSection")
        case "familyAnesthesiaDetails": return t("preop.familyAnesthesia")
        case "difficultAirwayNotes": return t("preop.difficultAirwayDetails")
        case "physicalExamReport": return t("preop.physicalExamReport")
        case "notes": return t("preop.notesLabel")
        default: return issue.field
      }
    })()
    switch (issue.reason) {
      case "likely_name": return t("case.piiLikelyName", { field })
      case "egn": return t("case.piiEgn", { field })
      case "long_number": return t("case.piiLongNumber", { field })
      case "date": return t("case.piiDate", { field })
      case "email": return t("case.piiEmail", { field })
      default: return t("case.piiGeneric", { field })
    }
  }, [t])

  // Values the server refused, per section, shown on the field that carries
  // them. Sticky: a message that lives only in the header is missed by anyone
  // who leaves the screen straight after typing — which is exactly when this
  // happens. Cleared when the section next saves with nothing refused.
  const [rejections, setRejections] = useState<Record<string, Map<string, string>>>({})
  const noteRejections = useCallback((section: "preop" | "intraop" | "postop", body: unknown) => {
    // Never allowed to throw: this runs on the save path of a clinical form.
    try {
      const mine = rejectionsForSection(readRejectedFields(body), section)
      setRejections(prev => {
        const next = rejectionMessages(mine, t("case.notSaved"))
        if (next.size === 0 && !prev[section]) return prev   // nothing to change
        return { ...prev, [section]: next }
      })
    } catch {
      /* a broken notifier must never break charting */
    }
  }, [t])
  const [loading, setLoading]         = useState(false)
  const [patientName, setPatientName] = useState("")
  const [patientId,   setPatientId]   = useState("")
  const [caseCode, setCaseCode]       = useState<string | null>(null)
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
  // One idempotency key per form session: a create retried after a network
  // blip (autosave re-fires while caseIdRef is still null) can't double-create.
  const createDraftIdRef = useRef(`web-${randomId()}`)
  const startCloseCountdownRef = useRef<() => void>(() => {})
  const dbIntraopToFormRef = useRef<(intraop: CaseDetailIntraop) => Partial<IntraopData>>(() => ({}))

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
      .then(async (record: CaseDetail) => {
        if (record.status === "COMPLETE") {
          toast(t("case.caseFinalisedRedirect"))
          router.replace(`/cases/${continueId}`)
          return
        }
        caseIdRef.current = continueId
        setCaseId(continueId)
        if (record.caseCode) setCaseCode(record.caseCode)

        const [queuedPreop, queuedIntraop, queuedPostop, pendingEvents, pendingMutations] = await Promise.all([
          autosaveManager.outbox.load<Record<string, unknown>>(continueId, "preop").catch(() => null),
          autosaveManager.outbox.load<Record<string, unknown>>(continueId, "intraop").catch(() => null),
          autosaveManager.outbox.load<Record<string, unknown>>(continueId, "postop").catch(() => null),
          autosaveManager.pendingEvents.loadPending<Record<string, unknown> & { id: string }>(continueId).catch(() => []),
          autosaveManager.eventMutations.load(continueId).catch(() => []),
        ])

        if (record.preop) {
          const serverForm = dbPreopToForm(record.preop) as PreopData
          autosaveManager.hydrateSection(
            continueId,
            "preop",
            sectionPayload("preop", serverForm),
            record.preop.syncRevision ?? record.preop.updatedAt,
          )
          setPreopData(dbPreopToForm({ ...record.preop, ...queuedPreop } as CaseDetailPreop) as PreopData)
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
          const serverForm = dbIntraopToFormRef.current(record.intraop) as IntraopData
          autosaveManager.hydrateSection(
            continueId,
            "intraop",
            sectionPayload("intraop", serverForm),
            record.intraop.syncRevision ?? record.intraop.updatedAt,
          )
          setIntraopData(dbIntraopToFormRef.current({ ...record.intraop, ...queuedIntraop } as CaseDetailIntraop) as IntraopData)
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
        // URL step param wins; fall back to deriving from saved data
        const target = stepParam
          ? Math.max(0, Math.min(3, parseInt(stepParam)))
          : record.postop ? 3 : record.intraop ? 1 : 0
        setStep(target)
        // Re-enter the 30-min window when reopening a case that had postop but isn't finalised
        if (target === 3) {
          startCloseCountdownRef.current()
        }
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
  }, [router, searchParams, t])

  // Keep -step= in sync so refresh lands on the right step
  useEffect(() => {
    if (!caseId) return
    router.replace(`/cases/new?continue=${caseId}&step=${step}`, { scroll: false })
  }, [step, caseId, router])

  // Cleanup countdowns on unmount
  useEffect(() => () => { if (closeTimerRef.current) clearInterval(closeTimerRef.current) }, [])
  useEffect(() => () => { if (undoTimerRef.current) clearInterval(undoTimerRef.current) }, [])

  // Convert Prisma DateTime -> HH:MM. DB values are stored in UTC (ref date 2000-01-01),
  // so read UTC hours/minutes to recover the original local time the user entered.
  function isoToHHMM(iso: unknown): string | undefined {
    if (!iso) return undefined
    if (typeof iso === "string" && /^\d{2}:\d{2}$/.test(iso)) return iso
    if (typeof iso !== "string" && typeof iso !== "number" && !(iso instanceof Date)) return undefined
    try {
      const d = new Date(iso)
      if (!isNaN(d.getTime())) return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`
    } catch {}
    return undefined
  }


  // Convert flat DB preop record -> PreopForm defaultValues shape
  // Only map fields that exist in the PreopForm schema - strip all DB-only fields
  // (id, caseId, bmi, rcriScore, gutaScore, apfelScore, stopBangScore, createdAt, etc.)
  function dbPreopToForm(p: CaseDetailPreop): Partial<PreopData> {
    // Comma-joined fields (allergyDetails, currentMedications)
    const toTags = (str: string | null | undefined) => {
      if (!str) return []
      const trimmed = str.trim()
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed)
          if (Array.isArray(parsed)) return parsed
        } catch {}
      }
      return str.split(",").map(s => s.trim()).filter(Boolean).map(label => ({ label }))
    }
    // Semicolon-joined fields - diagnoses/procedure names can contain commas
    const toTagsSemi = (json: unknown, str: string | null | undefined) => {
      if (Array.isArray(json) && json.length > 0) return json as { label: string; sub?: string }[]
      return str ? str.split(";").map(s => s.trim()).filter(Boolean).map(label => ({ label })) : []
    }

    return {
      // Demographics
      ageYears:  p.ageYears  ?? undefined,
      sex:       p.sex       ?? undefined,
      heightCm:  p.heightCm  ?? undefined,
      weightKg:  p.weightKg  ?? undefined,
      bloodType: p.bloodType ?? undefined,
      rhFactor:  p.rhFactor  ?? undefined,

      // Case - prefer JSON arrays; fall back to semicolon-split string (never comma-split)
      diagnoses:          toTagsSemi(p.diagnosesJson, p.diagnosis),
      procedures:         toTagsSemi(p.proceduresJson, p.plannedProcedure),
      teamNotes:            p.teamNotes            ?? undefined,
      highRiskSurgery:      p.highRiskSurgery      ?? false,
      emergencySurgery:     p.emergencySurgery      ?? false,

      // Medical history
      comorbidities: Array.isArray(p.comorbidities)
        ? p.comorbidities.map(c => typeof c === "string" ? { label: c } : c)
        : [],

      // Safety
      allergies:                p.allergies                ?? false,
      allergyDetails:           toTags(p.allergyDetails),
      latexAllergy:             p.latexAllergy             ?? false,
      currentMedications:       toTags(p.currentMedications),
      familyAnesthesiaProblems: p.familyAnesthesiaProblems ?? false,
      familyAnesthesiaDetails:  p.familyAnesthesiaDetails  ?? undefined,
      dentalProsthetics:        p.dentalProsthetics        ?? false,
      looseTeeth:               p.looseTeeth               ?? false,
      smoking:                  p.smoking                  ?? false,
      substanceAbuse:           p.substanceAbuse           ?? false,

      // Vitals
      bpSystolic:      p.bpSystolic      ?? undefined,
      bpDiastolic:     p.bpDiastolic     ?? undefined,
      heartRate:       p.heartRate       ?? undefined,
      heartArrhythmia: p.heartArrhythmia ?? false,
      spO2:            p.spO2            ?? undefined,
      temperature:     p.temperature     ?? undefined,
      respiratoryRate: p.respiratoryRate ?? undefined,

      // Airway
      mallampati:             p.mallampati             ?? undefined,
      mouthOpeningCm:         p.mouthOpeningCm         ?? undefined,
      thyromental:            p.thyromental            ?? undefined,
      neckMobility:           p.neckMobility           ?? undefined,
      upperLipBiteTest:       p.upperLipBiteTest       ?? undefined,
      retrognathia:           p.retrognathia           ?? false,
      prominentIncisors:      p.prominentIncisors      ?? false,
      facialHair:             p.facialHair             ?? false,
      difficultAirwayHistory: p.difficultAirwayHistory ?? false,
      difficultAirwayNotes:   p.difficultAirwayNotes   ?? undefined,
      cormackLehane:          p.cormackLehane          ?? undefined,

      // Scores
      asaScore: p.asaScore ?? undefined,

      labResults: Array.isArray(p.labResults) ? p.labResults : [],

      // Patient fields (never saved to DB - intentionally left empty for GDPR)
      patientFirstName: undefined,
      patientLastName:  undefined,
      patientId:        undefined,
    }
  }

  function dbPostopToForm(o: CaseDetailPostop): PostopData {
    return {
      aldreteActivity:      o.aldreteActivity      ?? undefined,
      aldreteRespiration:   o.aldreteRespiration   ?? undefined,
      aldreteCirculation:   o.aldreteCirculation   ?? undefined,
      aldreteConsciousness: o.aldreteConsciousness ?? undefined,
      aldreteSpO2:          o.aldreteSpO2          ?? undefined,
      painScoreNRS:         o.painScoreNRS         ?? undefined,
      ponv:                 o.ponv                 ?? false,
      temperatureCelsius:   o.temperatureCelsius   ?? undefined,
      recoveryBpSystolic:   o.recoveryBpSystolic   ?? undefined,
      recoveryBpDiastolic:  o.recoveryBpDiastolic  ?? undefined,
      recoveryHeartRate:    o.recoveryHeartRate    ?? undefined,
      recoverySpO2:         o.recoverySpO2         ?? undefined,
      recoveryBpUnobtainable:          o.recoveryBpUnobtainable          ?? false,
      recoveryHeartRateUnobtainable:   o.recoveryHeartRateUnobtainable   ?? false,
      recoverySpO2Unobtainable:        o.recoverySpO2Unobtainable        ?? false,
      recoveryTemperatureUnobtainable: o.recoveryTemperatureUnobtainable ?? false,
      disposition:          o.disposition          ?? undefined,
      dispositionNotes:     o.dispositionNotes     ?? undefined,
      handoverItems:        Array.isArray(o.handoverItems) ? o.handoverItems : [],
    }
  }

  function dbIntraopToForm(intraop: CaseDetailIntraop): Partial<IntraopData> {
    // Strip DB-only fields that don't belong in the form and would cause autosave
    // ZodErrors: keyEvents is a TimetableData object but intraopSchema expects an array;
    // id/caseId/createdAt/updatedAt are DB metadata; timeSeriesData/durationMinutes are computed.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, caseId, createdAt, updatedAt, keyEvents, timeSeriesData, durationMinutes, ...formFields } = intraop
    const endTimeNextDay = !!(intraop.endTime && intraop.startTime &&
      new Date(intraop.endTime).getTime() - new Date(intraop.startTime).getTime() > 12 * 60 * 60 * 1000)

    // Prefer the real instants, rendered in the zone the case was charted in —
    // so a case reads the same wall clock wherever it is later opened. Legacy
    // rows fall back to their bare stored wall clock.
    const tz = intraop.timezone ?? null
    const startFromInstant = intraop.startedAt && tz
      ? localTimeOf(new Date(intraop.startedAt), tz) ?? undefined : undefined
    const endFromInstant = intraop.endedAt && tz
      ? localTimeOf(new Date(intraop.endedAt), tz) ?? undefined : undefined

    return {
      // JSON-blob fields (positions, techniques, airwayDevices, etc.) are
      // unknown on CaseDetailIntraop - genuinely loosely shaped at the DB
      // level - but always arrays/scalars matching IntraopData's shape in
      // practice, at the same boundary as the rest of this file's DB-to-form mapping.
      ...(formFields as unknown as Partial<IntraopData>),
      monthYear:      intraop.monthYear ?? undefined,
      startTime:      startFromInstant ?? isoToHHMM(intraop.startTime),
      endTime:        endFromInstant ?? (intraop.endTime ? isoToHHMM(intraop.endTime) : undefined),
      endTimeNextDay,
    }
  }
  dbIntraopToFormRef.current = dbIntraopToForm

  function sectionPayload(
    section: "preop" | "intraop" | "postop",
    data: PreopData | IntraopData | PostopData,
  ): Record<string, unknown> {
    if (section === "preop") {
      const preop = data as PreopData
      const bmi = preop.heightCm && preop.weightKg ? calcBMI(preop.heightCm, preop.weightKg) : undefined
      const clinicalPreop = { ...preop } as Record<string, unknown>
      delete clinicalPreop.patientFirstName
      delete clinicalPreop.patientLastName
      delete clinicalPreop.patientId
      return { ...clinicalPreop, bmi }
    }
    if (section === "intraop") {
      const intraop = data as IntraopData
      return {
        ...intraop,
        timezone: intraop.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
    }
    return data as Record<string, unknown>
  }

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
          const res = await fetch("/api/cases", {
            method: "POST",
            headers: { "Content-Type": "application/json", [IDEMPOTENCY_HEADER]: createDraftIdRef.current },
            body: JSON.stringify({ patientNumber, preop: acceptedPayload }),
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
        noteRejections("preop", createdBody)
        caseIdRef.current = id
        setCaseId(id)
        if (code) setCaseCode(code)
        autosaveManager.hydrateSection(id, "preop", acceptedPayload, preopRevision ?? preopUpdatedAt ?? null)
        router.replace(`/cases/new?continue=${id}`, { scroll: false })
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
      } else {
        const existingCaseId = caseIdRef.current
        const outcome = await autosaveManager.saveSection(existingCaseId, section, payload, {
          fullPayload: payload,
        })
        if (outcome.response) noteRejections(section, outcome.response)
        if (outcome.result === "blocked" && outcome.blocked) {
          const message = blockedMessage(outcome.blocked)
          setBlockedIssue(outcome.blocked)
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
      return true
    } catch (err: unknown) {
      console.error("saveSection error:", err)
      const errMsg = err instanceof Error ? err.message : t("case.saveFailed")
      if (showToast) toast.error(errMsg)
      onError?.(errMsg)
      return false
    }
  }, [t, router, noteRejections, blockedMessage])

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

  // ── Manual submit handlers - step advances regardless of save result ─────────
  async function handlePreopSubmit(data: PreopData) {
    setPreopData(data)
    setStep(1); window.scrollTo(0, 0)
    // Save in background - don't block navigation on success/failure
    setSubmitting(true)
    await saveSection("preop", data, { showToast: true })
    setSubmitting(false)
  }

  async function handleIntraopSubmit(data: IntraopData) {
    setIntraopData(data)
    setStep(2); window.scrollTo(0, 0)
    if (!caseIdRef.current) return
    setSubmitting(true)
    await saveSection("intraop", data, { showToast: true })
    setSubmitting(false)
  }

  async function handlePostopSubmit(postopData: PostopData) {
    if (!caseIdRef.current) return
    setSubmitting(true)
    try {
      const saved = await saveSection("postop", postopData, { showToast: true })
      if (!saved || saved === "queued") throw new Error()
      setPostopData(postopData)
      // Start 30-minute graceful close countdown before finalising
      startCloseCountdown()
      setStep(3); window.scrollTo(0, 0)
    } catch {
      toast.error(t("case.saveFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  function startCloseCountdown() {
    const id = caseIdRef.current
    if (!id) return
    if (closeTimerRef.current) clearInterval(closeTimerRef.current)

    const storageKey = `summaryOpenedAt_${id}`
    const stored = localStorage.getItem(storageKey)
    const openedAt = stored ? parseInt(stored, 10) : Date.now()
    if (!stored) localStorage.setItem(storageKey, String(openedAt))

    const remaining = Math.max(
      0,
      INTRAOP_RESUME_WINDOW_SECONDS - Math.floor((Date.now() - openedAt) / 1000),
    )
    if (remaining === 0) { finaliseCase(); return }

    setCloseSecsLeft(remaining)
    closeTimerRef.current = setInterval(() => {
      setCloseSecsLeft(s => {
        if (s === null || s <= 1) {
          clearInterval(closeTimerRef.current!)
          closeTimerRef.current = null
          localStorage.removeItem(`summaryOpenedAt_${id}`)
          finaliseCase()
          return null
        }
        return s - 1
      })
    }, 1000)
  }
  startCloseCountdownRef.current = startCloseCountdown

  async function finaliseCase() {
    const id = caseIdRef.current
    if (!id) return
    if (closeTimerRef.current) { clearInterval(closeTimerRef.current); closeTimerRef.current = null }
    localStorage.removeItem(`summaryOpenedAt_${id}`)
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
      toast.success("Finalization undone. You can continue editing.")
      // Re-enter the close countdown for the restored case
      startCloseCountdown()
    } catch {
      toast.error("Could not undo finalization. Please try again.")
    }
  }

  const visiblePreopRejections = new Map(rejections.preop ?? [])
  if (blockedIssue) {
    const field =
      blockedIssue.field === "diagnosis" ? "diagnoses"
      : blockedIssue.field === "plannedProcedure" ? "procedures"
      : blockedIssue.field
    const preopFields = new Set([
      "diagnoses", "procedures", "comorbidities", "teamNotes",
      "allergyDetails", "currentMedications", "familyAnesthesiaDetails",
      "difficultAirwayNotes", "physicalExamReport", "preopNotes",
    ])
    if (preopFields.has(field)) visiblePreopRejections.set(field, blockedMessage(blockedIssue))
  }

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
      <div className="no-print flex items-center gap-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950 border-2 border-blue-100 dark:border-blue-900 shrink-0">
          <UserRound className="h-9 w-9 text-blue-500 dark:text-blue-400" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">
            {patientName
              ? <>{patientName}{patientId && <span className="text-slate-400 font-normal text-lg"> - ID: {patientId}</span>}</>
              : t("case.newTitle")
            }
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">{t("case.newSubtitle")}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          {caseId && caseCode && (
            <CaseMeta caseId={caseId} caseCode={caseCode} />
          )}
          <div className="text-xs">
            {saveStatus === "saving" && <span className="text-slate-400 animate-pulse">{t("case.savingDraft")}</span>}
            {saveStatus === "saved"  && <span className="text-green-500">{t("case.draftSaved")}</span>}
            {saveStatus === "queued" && <span className="text-amber-500">{t("case.draftQueued")}</span>}
            {saveStatus === "blocked" && <span className="text-red-500">{autoSaveErrMsg ?? t("case.draftBlocked")}</span>}
            {saveStatus === "error"  && <span className="text-red-400">{autoSaveErrMsg ?? t("case.autoSaveFailed")}</span>}
          </div>
        </div>
      </div>

      <div className="no-print space-y-3">
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-2" />
        <div className="flex justify-between">
          {STEPS.map((label, i) => {
            const isClickable = step === 3 && i < 3 && !!caseId
            return (
              <button key={label} type="button"
                onClick={() => { if (isClickable) setStep(i) }}
                className={`flex items-center gap-1.5 ${isClickable ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"}`}>
                {i < step
                  ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                  : <div className={`h-4 w-4 rounded-full border-2 ${i === step ? "border-blue-600 bg-blue-600" : "border-slate-300"}`} />
                }
                <span className={`text-sm font-medium ${i === step ? "text-blue-600" : i < step ? "text-green-600" : "text-slate-400"} ${isClickable ? "underline underline-offset-2" : ""}`}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

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
            onNameChange={setPatientName}
            onIdChange={setPatientId}
            onAutoSave={data => !caseIdRef.current && !data.patientId?.trim() ? undefined : handleAutoSave("preop", data)}
            layoutMode={preopLayout}
            caseId={caseId}
          />
        )}
        {!loading && step === 1 && (
          <IntraopForm
            defaultValues={intraopData ?? undefined}
            defaultTimetable={timetableDefault ?? undefined}
            preop={preopData ? {
              asaScore:              preopData.asaScore,
              ageYears:              preopData.ageYears,
              heightCm:              preopData.heightCm,
              weightKg:              preopData.weightKg,
              sex:                   preopData.sex,
              bmi:                   preopData.heightCm && preopData.weightKg ? Math.round(preopData.weightKg / ((preopData.heightCm / 100) ** 2) * 10) / 10 : undefined,
              bpSystolic:            preopData.bpSystolic,
              bpDiastolic:           preopData.bpDiastolic,
              heartRate:             preopData.heartRate,
              spO2:                  preopData.spO2,
              mallampati:            preopData.mallampati,
              neckMobility:          preopData.neckMobility,
              mouthOpeningCm:        preopData.mouthOpeningCm,
              cormackLehane:         preopData.cormackLehane,
              difficultAirwayHistory: preopData.difficultAirwayHistory,
              allergies:             preopData.allergies,
              allergyDetails:        preopData.allergyDetails,
              comorbidities:         preopData.comorbidities,
              currentMedications:    preopData.currentMedications,
              labResults:            preopData.labResults,
              diagnosis:             preopData.diagnoses?.map(t => t.label).join("; ") || null,
              plannedProcedure:      preopData.procedures?.map(t => t.label).join("; ") || null,
              emergencySurgery:      preopData.emergencySurgery ?? null,
            } : null}
            caseStarted={!!(intraopData?.startTime)}
            onSubmit={handleIntraopSubmit}
            onBack={() => setStep(0)}
            onAutoSave={data => handleAutoSave("intraop", data)}
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
            onSubmit={handlePostopSubmit}
            onBack={() => setStep(1)}
            submitting={submitting}
            onAutoSave={data => handleAutoSave("postop", data)}
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
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => { setCloseSecsLeft(null); finaliseCase() }}>
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
