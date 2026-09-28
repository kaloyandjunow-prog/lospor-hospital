import type { SaveIntraopEvent } from "@/lib/intraop-stamp"
import { serverNow } from "@/lib/server-clock"
import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import { confirmAction, notify } from "@/lib/notify"
import type { ActiveFluid, ActiveGasSettings, ActiveInfusion, LogEvent } from "@/lib/intraop-log-event"
import { buildFinaliseCaseState, buildReopenedEndedState, buildResumeCaseState } from "@/lib/intraop-case-lifecycle"
import { buildEndCaseRunningItems, hasEndCaseRunningItems, type EndCaseStopOptions } from "@/lib/intraop-end-case-items"
import type { EndCaseAfterEndItem, EndCaseCleanupItem, EndCaseStopContext } from "@/components/intraop/EndCaseSheet"
import type { RunningAgent } from "@/lib/use-intraop-running-state"
import { formatDateHHMM } from "@/lib/intraop-projection"
import { formatMessage } from "@/i18n/locale"
import { intraopEndCaseStopIds } from "@lospor/core/intraop-commands"
import { intraopAttentionItems, intraopAttentionText, type IntraopAttentionAction } from "@lospor/core/intraop-attention"
import { localTimeOf } from "@lospor/core/intraop-time"
import { logAfterAttentionAnswer, useIntraopAttention } from "@/lib/use-intraop-attention"
import { useCaseSaveState } from "@/lib/use-case-save-state"
import { useResumeCountdown } from "@/lib/use-resume-countdown"
import { promoteDraftCaseToInProgress, type IntraopTimingOverrides } from "@/lib/intraop-timing"
import {
  buildIntraopEndTiming,
  buildIntraopStartTiming,
  isValidTimeZone,
  resolvedTimeZone,
  startInstantForWallClock,
} from "@lospor/core/intraop-time"
import {
  evaluateIntraopReadiness,
  type ClinicalIssueCode,
} from "@lospor/core/clinical-validation"
import { usePreferences, type ClinicalStringKey } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

const INTRAOP_ISSUE_LABEL_KEYS: Partial<Record<ClinicalIssueCode, ClinicalStringKey>> = {
  missing_start_time: "issueAnaesthesiaStart",
  missing_end_time: "issueAnaesthesiaEnd",
  entries_after_case_end: "endCaseFinaliseBlocked",
  missing_technique: "issueAnaesthesiaTechnique",
  invalid_intraop_times: "issueInvalidTimes",
  missing_airway_documentation: "issueAirway",
  missing_position: "issuePosition",
  missing_monitoring: "issueMonitoring",
  missing_vascular_access: "issueVascularAccess",
  missing_vitals: "issueVitals",
  missing_medications: "issueMedications",
  missing_fluids: "issueFluids",
  missing_complication_documentation: "issueComplications",
}

type CaseInfoState = {
  caseCode: string
  procedure?: string
  diagnosis?: string
  techniques?: string[]
  status?: string
  finalizedAt?: string | null
}

type SaveEvent = SaveIntraopEvent
type SaveTiming = (overrides?: IntraopTimingOverrides) => Promise<void>
type PatchIntraopSection = (payload: Record<string, unknown>) => Promise<unknown>

type UseIntraopCaseLifecycleArgs = {
  startRef: MutableRefObject<Date | null>
  setElapsedMs: Dispatch<SetStateAction<number>>
  setCaseInfo: Dispatch<SetStateAction<CaseInfoState | null>>
  setCaseStartTime: Dispatch<SetStateAction<string>>
  setCaseEndTime: Dispatch<SetStateAction<string>>
  setCaseEndNextDay: Dispatch<SetStateAction<boolean>>
  caseTimezone: string | null
  save: SaveEvent
  saveTiming: SaveTiming
  patchIntraopSection: PatchIntraopSection
  cancelLabel: string
  activeAgents: RunningAgent[]
  activeGas: ActiveGasSettings
  activeInfusions: ActiveInfusion[]
  activeFluids: ActiveFluid[]
  stopAgent: (name: string, rowTs: null, options: EndCaseStopOptions) => void | Promise<void>
  stopGasSettings: (rowTs: null, options: EndCaseStopOptions) => void | Promise<void>
  stopInfusion: (target: ActiveInfusion, rowTs: null, options: EndCaseStopOptions) => void | Promise<void>
  stopFluidDirect: (target: ActiveFluid, context?: EndCaseStopContext) => void | Promise<void>
  getReadinessInput: () => Record<string, unknown>
  /** The saved log and its editors, for entries after the end and Resume. */
  timeline: {
    caseId: string | null
    log: LogEvent[]
    logRef: MutableRefObject<LogEvent[]>
    syncLog: (next: LogEvent[]) => Promise<boolean>
    removeEvent: (event: LogEvent) => Promise<void>
    labelOf: (event: LogEvent) => string
    endedAtRef: MutableRefObject<Date | null>
    resyncActiveRef: MutableRefObject<() => void>
  }
}

export function useIntraopCaseLifecycle({
  startRef,
  setElapsedMs,
  setCaseInfo,
  setCaseStartTime,
  setCaseEndTime,
  setCaseEndNextDay,
  caseTimezone,
  save,
  saveTiming,
  patchIntraopSection,
  cancelLabel,
  activeAgents,
  activeGas,
  activeInfusions,
  activeFluids,
  stopAgent,
  stopGasSettings,
  stopInfusion,
  stopFluidDirect,
  getReadinessInput,
  timeline,
}: UseIntraopCaseLifecycleArgs) {
  const shade = useShade()
  const { tc, language } = usePreferences()
  const [endCaseOpen, setEndCaseOpen] = useState(false)
  const [startAtOpen, setStartAtOpen] = useState(false)
  const [startAtInput, setStartAtInput] = useState("")
  const [endCaseDecisions, setEndCaseDecisions] = useState<Record<string, "stop" | "continue">>({})
  const [continuedPostopItems, setContinuedPostopItems] = useState<string[]>([])
  const [caseEnded, setCaseEnded] = useState(false)
  const caseEndedAtRef = useRef<Date | null>(null)
  const [resumeSecsLeft, setResumeSecsLeft] = useState(0)
  const [resumeUnlimited, setResumeUnlimited] = useState(false)
  // The minute End case was opened at: entries dated after it, and stops
  // entered ahead and still unconfirmed, are answered before the case ends.
  // Which ones, and what each answer writes, is Core's (intraop-attention).
  const [endCaseAt, setEndCaseAt] = useState<Date | null>(null)
  const attention = useIntraopAttention({
    log: timeline.log,
    logRef: timeline.logRef,
    endedAtRef: timeline.endedAtRef,
    syncLog: timeline.syncLog,
    resyncActiveRef: timeline.resyncActiveRef,
  })
  const saveState = useCaseSaveState(timeline.caseId)

  useResumeCountdown(caseEndedAtRef, resumeSecsLeft, setResumeSecsLeft)

  async function startCaseNow() {
    if (startRef.current) return
    const now = serverNow()
    const zone = isValidTimeZone(caseTimezone) ? caseTimezone : resolvedTimeZone()
    const timing = zone ? buildIntraopStartTiming(now, zone) : null
    if (!timing) return
    startRef.current = now
    setElapsedMs(0)
    setCaseStartTime(timing.startTime)
    await saveTiming(timing)
    setCaseInfo(promoteDraftCaseToInProgress)
    await save(
      { type: "clinical_event", label: "Anaesthesia start", color: shade("#22c55e") },
      timing.startedAt,
    )
  }

  async function startCaseAt(hhmm: string) {
    if (startRef.current) return
    const zone = isValidTimeZone(caseTimezone) ? caseTimezone : resolvedTimeZone()
    const startDate = zone ? startInstantForWallClock(serverNow(), hhmm, zone) : null
    const timing = startDate && zone ? buildIntraopStartTiming(startDate, zone) : null
    if (!startDate || !timing) return
    startRef.current = startDate
    setElapsedMs(serverNow().getTime() - startDate.getTime())
    setCaseStartTime(timing.startTime)
    await saveTiming(timing)
    setCaseInfo(promoteDraftCaseToInProgress)
    await save({ type: "clinical_event", label: "Anaesthesia start", color: shade("#22c55e") }, timing.startedAt)
    setStartAtOpen(false)
  }

  /** Opened after it ended: shown as ended, with Resume where allowed (9.12.1). */
  function restoreEndedCase(endedAt: Date, autoEnded: boolean) {
    const next = buildReopenedEndedState(endedAt, autoEnded, serverNow().getTime())
    caseEndedAtRef.current = endedAt
    timeline.endedAtRef.current = endedAt
    setCaseEnded(true)
    setResumeUnlimited(next.resumeUnlimited)
    setResumeSecsLeft(next.resumeSecsLeft)
  }

  async function finaliseCase(continuedItems: string[], endTs = serverNow().toISOString()) {
    // Ending an ended case again would move its saved end to now.
    if (caseEndedAtRef.current) return
    setEndCaseOpen(false)
    const parsedEnd = new Date(endTs)
    const next = buildFinaliseCaseState(
      continuedItems,
      Number.isNaN(parsedEnd.getTime()) ? serverNow() : parsedEnd,
    )
    if (next.continuedItems) setContinuedPostopItems(next.continuedItems)
    const zone = isValidTimeZone(caseTimezone) ? caseTimezone : resolvedTimeZone()
    const timing = zone ? buildIntraopEndTiming(next.endedAt, zone) : null
    const endTime = timing?.endTime ?? next.endTime
    const startTime = startRef.current && zone
      ? buildIntraopStartTiming(startRef.current, zone)?.startTime
      : null
    const nextDay = !!startTime && endTime < startTime
    setCaseEndTime(endTime)
    setCaseEndNextDay(nextDay)
    await saveTiming({
      endTime,
      endedAt: timing?.endedAt,
      timezone: timing?.timezone,
      endTimeNextDay: nextDay,
    })
    // From here the chart is read at the end: continued items stop growing.
    timeline.endedAtRef.current = next.endedAt
    timeline.resyncActiveRef.current()
    setCaseEnded(true)
    caseEndedAtRef.current = next.endedAt
    setResumeSecsLeft(next.resumeSecsLeft)
  }

  async function openEndCase() {
    if (caseEndedAtRef.current) {
      notify(tc("tfEndCase"), tc("caseEnded"))
      return
    }
    const readiness = evaluateIntraopReadiness({
      ...getReadinessInput(),
      endedAt: serverNow().toISOString(),
    })
    const labels = (issues: typeof readiness.issues) => issues.map(issue =>
      INTRAOP_ISSUE_LABEL_KEYS[issue.code]
        ? tc(INTRAOP_ISSUE_LABEL_KEYS[issue.code] as ClinicalStringKey)
        : issue.code,
    )
    if (readiness.blockers.length > 0) {
      notify(
        tc("requiredInfoMissing"),
        `${tc("completeBeforeEnding")}\n\n${labels(readiness.blockers).map(label => `• ${label}`).join("\n")}`,
      )
      return
    }
    if (readiness.warnings.length > 0) {
      const proceed = await confirmAction(
        tc("sectionsIncomplete"),
        `${labels(readiness.warnings).map(label => `• ${label}`).join("\n")}\n\n${tc("continueAnywayQuestion")}`,
        { confirmLabel: tc("continueAnywayLabel"), cancelLabel },
      )
      if (!proceed) return
    }
    const at = new Date(Math.floor(serverNow().getTime() / 60_000) * 60_000)
    const pending = intraopAttentionItems(timeline.logRef.current, { now: at, endedAt: at })
    setEndCaseAt(at)
    if (pending.length > 0 || hasEndCaseRunningItems({ activeAgents, activeGas, activeInfusions, activeFluids })) {
      setEndCaseDecisions({})
      setEndCaseOpen(true)
    } else {
      const confirmed = await confirmAction(
        tc("endCaseTitle"),
        tc("allActiveItemsClear"),
        { confirmLabel: tc("continuePostopShort"), cancelLabel },
      )
      if (confirmed) await finaliseCase([])
    }
  }

  async function resumeCase() {
    const next = buildResumeCaseState()
    setCaseEnded(false)
    setResumeUnlimited(false)
    caseEndedAtRef.current = next.endedAt
    timeline.endedAtRef.current = null
    setResumeSecsLeft(next.resumeSecsLeft)
    setCaseEndTime(next.endTime)
    patchIntraopSection(next.patch).catch(() => {})
    // Offer to take back the stops End case made, so those items run again.
    const stopIds = new Set(intraopEndCaseStopIds(timeline.logRef.current))
    if (stopIds.size > 0 && await confirmAction(
      tc("resumeRemoveStopsTitle"),
      formatMessage(tc("resumeRemoveStopsMessage"), { count: stopIds.size }),
      { confirmLabel: tc("resumeRemoveStops"), cancelLabel: tc("resumeKeepStops") },
    )) {
      await timeline.syncLog(timeline.logRef.current.filter(event => !stopIds.has(event.id)))
    }
    timeline.resyncActiveRef.current()
  }

  // Each answer writes exactly what Core says it writes: "happened" moves an
  // entry to the end (a stop there is one Resume offers back), "did not
  // happen" deletes it with what depends on it, and an unconfirmed stop is
  // confirmed or withdrawn.
  async function resolveAfterEnd(id: string, action: IntraopAttentionAction) {
    const at = endCaseAt ?? serverNow()
    const next = logAfterAttentionAnswer(timeline.logRef.current, id, action, { now: serverNow(), endedAt: at })
    if (next) await timeline.syncLog(next)
    timeline.resyncActiveRef.current()
  }

  // Times in the case's own zone, never the device's.
  const clockOf = (ts: string) =>
    (isValidTimeZone(caseTimezone) ? localTimeOf(new Date(ts), caseTimezone) : null) ?? formatDateHHMM(new Date(ts))
  const afterEndItems: EndCaseAfterEndItem[] = endCaseAt
    ? intraopAttentionItems(timeline.log, { now: endCaseAt, endedAt: endCaseAt }).map(item => ({
        id: item.key,
        kind: item.kind,
        label: intraopAttentionText(item, language),
        time: clockOf(item.event.ts),
        color: item.event.color ?? shade("#fbbf24"),
      }))
    : []

  const endCaseRunningItems: EndCaseCleanupItem[] = buildEndCaseRunningItems({
    activeAgents,
    activeGas,
    activeInfusions,
    activeFluids,
    stopAgent,
    stopGasSettings,
    stopInfusion,
    stopFluid: stopFluidDirect,
    labels: {
      volatileInhalational: tc("volatileInhalational"),
      gasSettings: tc("gasSettings"),
      infusion: tc("trRowInfusion"),
      fluid: tc("trRowFluid"),
    },
  })

  return {
    endCaseOpen,
    setEndCaseOpen,
    startAtOpen,
    setStartAtOpen,
    startAtInput,
    setStartAtInput,
    endCaseDecisions,
    setEndCaseDecisions,
    continuedPostopItems,
    caseEnded,
    resumeSecsLeft,
    resumeUnlimited,
    restoreEndedCase,
    startCaseNow,
    startCaseAt,
    openEndCase,
    finaliseCase,
    resumeCase,
    endCaseRunningItems,
    afterEndItems,
    resolveAfterEnd,
    attention: { ...attention, clockOf, labelOf: timeline.labelOf, log: timeline.log, saveState },
  }
}
