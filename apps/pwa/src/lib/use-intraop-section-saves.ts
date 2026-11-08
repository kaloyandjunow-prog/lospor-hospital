import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import type { VascularEntry } from "@/lib/intraop-types"
import type { MonitoringOption } from "@/lib/intraop-option-mappers"
import { buildMonitoringSelectionPatch, buildTechniqueMonitoringUpdate } from "@/lib/intraop-monitoring-defaults"
import { buildIntraopTimingPatch, startInstantForEntry, type IntraopTimingOverrides } from "@/lib/intraop-timing"
import {
  buildIntraopEndTiming,
  buildIntraopStartTiming,
  defaultEndDayOffset,
  endInstantForWallClock,
  isValidTimeZone,
  monthYearOf,
  resolvedTimeZone,
} from "@lospor/core/intraop-time"

type CaseInfoState = {
  caseCode: string
  procedure?: string
  diagnosis?: string
  techniques?: string[]
  status?: string
  finalizedAt?: string | null
}

type PatchIntraopSection = (payload: Record<string, unknown>) => Promise<unknown>

type UseIntraopSectionSavesArgs = {
  patchIntraopSection: PatchIntraopSection
  monitoringOptions: MonitoringOption[]
  monitoring: string[]
  setMonitoring: Dispatch<SetStateAction<string[]>>
  setCaseInfo: Dispatch<SetStateAction<CaseInfoState | null>>
  caseMonthYear: string
  caseStartTime: string
  caseEndTime: string
  caseEndNextDay: boolean
  caseTimezone: string | null
  startRef: MutableRefObject<Date | null>
  /** The stored end, so the Timing tab can show its date. */
  endedAtRef?: MutableRefObject<Date | null>
  /** Keeps the screen's case month in step with the start date it was taken from. */
  setCaseMonthYear?: (monthYear: string) => void
}

export function useIntraopSectionSaves({
  patchIntraopSection,
  monitoringOptions,
  monitoring,
  setMonitoring,
  setCaseInfo,
  caseMonthYear,
  caseStartTime,
  caseEndTime,
  caseEndNextDay,
  caseTimezone,
  startRef,
  endedAtRef,
  setCaseMonthYear,
}: UseIntraopSectionSavesArgs) {
  const [timingSaving, setTimingSaving] = useState(false)
  const [fieldSaving, setFieldSaving] = useState<string | null>(null)
  /** The local state updates immediately, but an offline/network failure must still be visible beside the Smart control. */
  const [fieldSaveError, setFieldSaveError] = useState<string | null>(null)
  const [vascularSaving, setVascularSaving] = useState(false)

  async function saveTiming(overrides: IntraopTimingOverrides = {}) {
    setTimingSaving(true)
    setFieldSaveError(error => error === "timing" ? null : error)
    try {
      const zone = isValidTimeZone(overrides.timezone)
        ? overrides.timezone
        : isValidTimeZone(caseTimezone)
          ? caseTimezone
          : resolvedTimeZone()
      const enriched: IntraopTimingOverrides = { ...overrides }

      if ("startTime" in overrides && overrides.startTime && !overrides.startedAt && zone) {
        // Left at today, a start time keeps the old rule (ahead of now means
        // yesterday); a stepped date places the time on that date.
        const instant = startInstantForEntry(new Date(), overrides.startTime, overrides.startDayKey, zone)
        const timing = instant ? buildIntraopStartTiming(instant, zone) : null
        const monthYear = instant ? monthYearOf(instant, zone) : null
        if (timing) Object.assign(enriched, timing, monthYear ? { monthYear } : {})
        if (timing && monthYear) setCaseMonthYear?.(monthYear)
      }
      if ("endTime" in overrides && overrides.endTime && !overrides.endedAt && zone && startRef.current) {
        // A stepped end date wins; otherwise the end follows the start's date,
        // the next day when its clock time is earlier.
        const offset = overrides.endDayOffset
          ?? (overrides.endTimeNextDay != null ? (overrides.endTimeNextDay ? 1 : 0) : defaultEndDayOffset(startRef.current, overrides.endTime, zone))
        const instant = endInstantForWallClock(startRef.current, overrides.endTime, zone, offset)
        const timing = instant ? buildIntraopEndTiming(instant, zone) : null
        if (timing) Object.assign(enriched, timing, { endTimeNextDay: offset > 0 })
        if (instant && endedAtRef) endedAtRef.current = instant
      }

      await patchIntraopSection(buildIntraopTimingPatch({
        monthYear: caseMonthYear,
        startTime: caseStartTime,
        endTime: caseEndTime,
        endTimeNextDay: caseEndNextDay,
        startedAt: startRef.current?.toISOString(),
        timezone: zone,
      }, enriched))
      if (enriched.startedAt) startRef.current = new Date(enriched.startedAt)
    } catch {
      setFieldSaveError("timing")
    } finally {
      setTimingSaving(false)
    }
  }

  async function saveVascularAccesses(next: VascularEntry[]) {
    setVascularSaving(true)
    setFieldSaveError(error => error === "vascular" ? null : error)
    try {
      await patchIntraopSection({ vascularAccesses: next })
    } catch {
      setFieldSaveError("vascular")
    } finally {
      setVascularSaving(false)
    }
  }

  async function savePositions(next: string[]) {
    setFieldSaving("positions")
    setFieldSaveError(error => error === "positions" ? null : error)
    try {
      await patchIntraopSection({ positions: next })
    } catch {
      setFieldSaveError("positions")
    } finally {
      setFieldSaving(null)
    }
  }

  async function saveMonitoring(next: string[]) {
    setFieldSaving("monitoring")
    setFieldSaveError(error => error === "monitoring" ? null : error)
    try {
      await patchIntraopSection(buildMonitoringSelectionPatch(monitoringOptions, next))
    } catch {
      setFieldSaveError("monitoring")
    } finally {
      setFieldSaving(null)
    }
  }

  async function saveTechniques(next: string[], sides?: Record<string, string>) {
    setFieldSaving("techniques")
    setFieldSaveError(error => error === "techniques" ? null : error)
    try {
      const { patch, monitoring: nextMonitoring } = buildTechniqueMonitoringUpdate(monitoringOptions, monitoring, next)
      if (nextMonitoring) setMonitoring(nextMonitoring)
      // The side of a block travels with the list it belongs to (10.2.0): the server keeps a side only for a technique that is on it.
      await patchIntraopSection(sides ? { ...patch, techniques: next, techniqueSides: sides } : patch)
      setCaseInfo(prev => prev ? { ...prev, techniques: next } : prev)
    } catch {
      setFieldSaveError("techniques")
    } finally {
      setFieldSaving(null)
    }
  }

  return {
    timingSaving,
    fieldSaving,
    fieldSaveError,
    vascularSaving,
    saveTiming,
    saveVascularAccesses,
    savePositions,
    saveMonitoring,
    saveTechniques,
  }
}
