import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import { confirmAction, notify } from "@/lib/notify"
import type { ActiveFluid, ActiveGasSettings, ActiveInfusion, LogEvent } from "@/lib/intraop-log-event"
import { buildFinaliseCaseState, buildResumeCaseState } from "@/lib/intraop-case-lifecycle"
import { buildEndCaseRunningItems, hasEndCaseRunningItems } from "@/lib/intraop-end-case-items"
import type { EndCaseCleanupItem, EndCaseStopContext } from "@/components/intraop/EndCaseSheet"
import { promoteDraftCaseToInProgress, type IntraopTimingOverrides } from "@/lib/intraop-timing"
import {
  buildIntraopEndTiming,
  buildIntraopStartTiming,
  isValidTimeZone,
  resolvedTimeZone,
  startInstantForWallClock,
} from "@lospor/core/intraop-time"
import { INTRAOP_RESUME_WINDOW_SECONDS } from "@lospor/core/intraop-engine"
import {
  evaluateIntraopReadiness,
  type ClinicalIssueCode,
} from "@lospor/core/clinical-validation"
import { usePreferences, type ClinicalStringKey } from "@/lib/preferences-context"

const INTRAOP_ISSUE_LABEL_KEYS: Partial<Record<ClinicalIssueCode, ClinicalStringKey>> = {
  missing_start_time: "issueAnaesthesiaStart",
  missing_end_time: "issueAnaesthesiaEnd",
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

type SaveEvent = (partial: Omit<LogEvent, "id" | "ts">, tsOverride?: string, silent?: boolean) => Promise<LogEvent>
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
  activeAgent: { name: string; color: string; percent?: number } | null
  activeGas: ActiveGasSettings
  activeInfusions: ActiveInfusion[]
  activeFluids: ActiveFluid[]
  stopAgent: () => void | Promise<void>
  stopGasSettings: () => void | Promise<void>
  stopInfusion: (target: ActiveInfusion) => void | Promise<void>
  stopFluidDirect: (target: ActiveFluid, context?: EndCaseStopContext) => void | Promise<void>
  getReadinessInput: () => Record<string, unknown>
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
  activeAgent,
  activeGas,
  activeInfusions,
  activeFluids,
  stopAgent,
  stopGasSettings,
  stopInfusion,
  stopFluidDirect,
  getReadinessInput,
}: UseIntraopCaseLifecycleArgs) {
  const { tc } = usePreferences()
  const [endCaseOpen, setEndCaseOpen] = useState(false)
  const [startAtOpen, setStartAtOpen] = useState(false)
  const [startAtInput, setStartAtInput] = useState("")
  const [endCaseDecisions, setEndCaseDecisions] = useState<Record<string, "stop" | "continue">>({})
  const [continuedPostopItems, setContinuedPostopItems] = useState<string[]>([])
  const [caseEnded, setCaseEnded] = useState(false)
  const caseEndedAtRef = useRef<Date | null>(null)
  const [resumeSecsLeft, setResumeSecsLeft] = useState(0)

  useEffect(() => {
    if (resumeSecsLeft <= 0) return
    const timer = setInterval(() => {
      if (!caseEndedAtRef.current) return
      const elapsed = Math.floor((Date.now() - caseEndedAtRef.current.getTime()) / 1000)
      const remaining = Math.max(0, INTRAOP_RESUME_WINDOW_SECONDS - elapsed)
      setResumeSecsLeft(remaining)
      if (remaining === 0) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [resumeSecsLeft])

  async function startCaseNow() {
    if (startRef.current) return
    const now = new Date()
    const zone = isValidTimeZone(caseTimezone) ? caseTimezone : resolvedTimeZone()
    const timing = zone ? buildIntraopStartTiming(now, zone) : null
    if (!timing) return
    startRef.current = now
    setElapsedMs(0)
    setCaseStartTime(timing.startTime)
    await saveTiming(timing)
    setCaseInfo(promoteDraftCaseToInProgress)
    await save(
      { type: "clinical_event", label: "Anaesthesia start", color: "#22c55e" },
      timing.startedAt,
    )
  }

  async function startCaseAt(hhmm: string) {
    if (startRef.current) return
    const zone = isValidTimeZone(caseTimezone) ? caseTimezone : resolvedTimeZone()
    const startDate = zone ? startInstantForWallClock(new Date(), hhmm, zone) : null
    const timing = startDate && zone ? buildIntraopStartTiming(startDate, zone) : null
    if (!startDate || !timing) return
    startRef.current = startDate
    setElapsedMs(Date.now() - startDate.getTime())
    setCaseStartTime(timing.startTime)
    await saveTiming(timing)
    setCaseInfo(promoteDraftCaseToInProgress)
    await save({ type: "clinical_event", label: "Anaesthesia start", color: "#22c55e" }, timing.startedAt)
    setStartAtOpen(false)
  }

  async function finaliseCase(continuedItems: string[], endTs = new Date().toISOString()) {
    setEndCaseOpen(false)
    const parsedEnd = new Date(endTs)
    const next = buildFinaliseCaseState(
      continuedItems,
      Number.isNaN(parsedEnd.getTime()) ? new Date() : parsedEnd,
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
    setCaseEnded(true)
    caseEndedAtRef.current = next.endedAt
    setResumeSecsLeft(next.resumeSecsLeft)
  }

  async function openEndCase() {
    const readiness = evaluateIntraopReadiness({
      ...getReadinessInput(),
      endedAt: new Date().toISOString(),
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
    if (hasEndCaseRunningItems({ activeAgent, activeGas, activeInfusions, activeFluids })) {
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

  function resumeCase() {
    const next = buildResumeCaseState()
    setCaseEnded(false)
    caseEndedAtRef.current = next.endedAt
    setResumeSecsLeft(next.resumeSecsLeft)
    setCaseEndTime(next.endTime)
    patchIntraopSection(next.patch).catch(() => {})
  }

  const endCaseRunningItems: EndCaseCleanupItem[] = buildEndCaseRunningItems({
    activeAgent,
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
    startCaseNow,
    startCaseAt,
    openEndCase,
    finaliseCase,
    resumeCase,
    endCaseRunningItems,
  }
}
