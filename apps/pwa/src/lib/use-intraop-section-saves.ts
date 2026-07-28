import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import type { VascularEntry } from "@/lib/intraop-types"
import type { MonitoringOption } from "@/lib/intraop-option-mappers"
import { buildMonitoringSelectionPatch, buildTechniqueMonitoringUpdate } from "@/lib/intraop-monitoring-defaults"
import { buildIntraopTimingPatch, type IntraopTimingOverrides } from "@/lib/intraop-timing"
import {
  buildIntraopEndTiming,
  buildIntraopStartTiming,
  endInstantForWallClock,
  isValidTimeZone,
  resolvedTimeZone,
  startInstantForWallClock,
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
}: UseIntraopSectionSavesArgs) {
  const [timingSaving, setTimingSaving] = useState(false)
  const [fieldSaving, setFieldSaving] = useState<string | null>(null)
  const [vascularSaving, setVascularSaving] = useState(false)

  async function saveTiming(overrides: IntraopTimingOverrides = {}) {
    setTimingSaving(true)
    try {
      const zone = isValidTimeZone(overrides.timezone)
        ? overrides.timezone
        : isValidTimeZone(caseTimezone)
          ? caseTimezone
          : resolvedTimeZone()
      const enriched: IntraopTimingOverrides = { ...overrides }

      if ("startTime" in overrides && overrides.startTime && !overrides.startedAt && zone) {
        const instant = startInstantForWallClock(new Date(), overrides.startTime, zone)
        const timing = instant ? buildIntraopStartTiming(instant, zone) : null
        if (timing) Object.assign(enriched, timing)
      }
      if ("endTime" in overrides && overrides.endTime && !overrides.endedAt && zone && startRef.current) {
        const instant = endInstantForWallClock(
          startRef.current,
          overrides.endTime,
          zone,
          overrides.endTimeNextDay ?? caseEndNextDay,
        )
        const timing = instant ? buildIntraopEndTiming(instant, zone) : null
        if (timing) Object.assign(enriched, timing)
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
      /* best-effort */
    } finally {
      setTimingSaving(false)
    }
  }

  async function saveVascularAccesses(next: VascularEntry[]) {
    setVascularSaving(true)
    try {
      await patchIntraopSection({ vascularAccesses: next })
    } catch {
      /* best-effort */
    } finally {
      setVascularSaving(false)
    }
  }

  async function savePositions(next: string[]) {
    setFieldSaving("positions")
    try {
      await patchIntraopSection({ positions: next })
    } catch {
      /* best-effort */
    } finally {
      setFieldSaving(null)
    }
  }

  async function saveMonitoring(next: string[]) {
    setFieldSaving("monitoring")
    try {
      await patchIntraopSection(buildMonitoringSelectionPatch(monitoringOptions, next))
    } catch {
      /* best-effort */
    } finally {
      setFieldSaving(null)
    }
  }

  async function saveTechniques(next: string[]) {
    setFieldSaving("techniques")
    try {
      const { patch, monitoring: nextMonitoring } = buildTechniqueMonitoringUpdate(monitoringOptions, monitoring, next)
      if (nextMonitoring) setMonitoring(nextMonitoring)
      await patchIntraopSection(patch)
      setCaseInfo(prev => prev ? { ...prev, techniques: next } : prev)
    } catch {
      /* best-effort */
    } finally {
      setFieldSaving(null)
    }
  }

  return {
    timingSaving,
    fieldSaving,
    vascularSaving,
    saveTiming,
    saveVascularAccesses,
    savePositions,
    saveMonitoring,
    saveTechniques,
  }
}
