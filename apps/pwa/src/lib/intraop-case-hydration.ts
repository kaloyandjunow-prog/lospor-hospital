import { rebuildActiveState } from "@/lib/intraop-active-state"
import { parseComplications } from "@/lib/intraop-complications"
import type { MonitoringOption } from "@/lib/intraop-option-mappers"
import {
  loadedTimetableStateFromLegacySnapshot,
  loadedTimetableStateFromLog,
  roundDown5Min,
  webTimetableToLog,
} from "@/lib/intraop-projection"
import { mergeLogWithPendingIntraopEvents } from "@/lib/pending-intraop-events"
import { hasAdvancedMonitoringSelected, selectedMonitoringFieldsFromRecord } from "@/lib/intraop-monitoring-defaults"
import { buildIntraopPreopSummary } from "@/lib/intraop-preop-summary"
import { expandedVentilationPanelForModes } from "@/lib/airway-ventilation"
import { parseLegacyKeyEvents, parseLogEvent, type LogEvent } from "@/lib/intraop-log-event"
import type { VascularEntry } from "@/lib/intraop-types"
import type { CaseDetailDto } from "@lospor/core/case-detail"
import type { EventMutation } from "@lospor/core/sync"
import { isValidTimeZone, localTimeOf } from "@lospor/core/intraop-time"
import { INTRAOP_COLUMN_MS } from "@lospor/core/intraop-engine"
import { normalizeOptionCodes } from "@lospor/core/option-aliases"

function storedHHMM(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw) return undefined
  if (!raw.includes("T")) return raw
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return undefined
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`
}

function defaultMonthYear() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export function buildLoadedIntraopCaseState(
  data: CaseDetailDto,
  pending: LogEvent[],
  monitoringOptions: MonitoringOption[],
  complicationItems: string[],
  pendingMutations: EventMutation[] = [],
  now = new Date(),
) {
  const caseTechniques = normalizeOptionCodes(
    "TECHNIQUE",
    Array.isArray(data.intraop?.techniques)
      ? data.intraop.techniques.filter((value): value is string => typeof value === "string")
      : [],
  )
  const keyEvents = parseLegacyKeyEvents(data.intraop?.keyEvents)
  const serverRaw = keyEvents.log ?? []
  const timezone = isValidTimeZone(data.intraop?.timezone) ? data.intraop.timezone : null
  const startedAt = typeof data.intraop?.startedAt === "string"
    ? new Date(data.intraop.startedAt)
    : null
  const trustedStart = startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : null
  const projectedWebRaw = serverRaw.length === 0 && trustedStart
    ? webTimetableToLog(keyEvents, roundDown5Min(trustedStart))
    : []
  const futureLimit = now.getTime() + INTRAOP_COLUMN_MS
  const webRaw = projectedWebRaw.some(event => Date.parse(event.ts) > futureLimit)
    ? []
    : projectedWebRaw
  let rawLog = mergeLogWithPendingIntraopEvents(serverRaw.length > 0 ? serverRaw : webRaw, pending)
  // Reapply durable edits/deletes before rendering after a restart. Otherwise
  // an offline deletion briefly resurrects from the server snapshot.
  for (const operation of pendingMutations) {
    if (operation.kind === "event.delete") {
      rawLog = rawLog.filter((event) => event.id !== operation.eventId)
    } else {
      const event = parseLogEvent(operation.event)
      if (event) rawLog = [event, ...rawLog.filter((item) => item.id !== operation.eventId)]
    }
  }
  const loadedFromLog = loadedTimetableStateFromLog(rawLog, now, trustedStart)
  const loadedTimetable = loadedFromLog.timetable
    ? loadedFromLog
    : loadedTimetableStateFromLegacySnapshot(keyEvents) ?? loadedFromLog

  const ventilationModes = Array.isArray(data.intraop?.ventilationModes)
    ? data.intraop.ventilationModes as string[]
    : undefined
  const complications = data.intraop?.complications
    ? parseComplications(data.intraop.complications, complicationItems)
    : null

  return {
    caseTechniques,
    rawLog,
    legacyWebLogNeedsSync: serverRaw.length === 0 && webRaw.length > 0,
    baseIntraopUpdatedAt: data.intraop?.updatedAt ?? data.intraopUpdatedAt,
    baseIntraopRevision: data.intraop?.syncRevision ?? data.intraopRevision,
    caseInfo: {
      caseCode: data.caseCode ?? "",
      procedure: data.preop?.plannedProcedure,
      diagnosis: data.preop?.diagnosis,
      techniques: caseTechniques,
      status: data.status,
      finalizedAt: data.finalizedAt ?? null,
    },
    positions: Array.isArray(data.intraop?.positions) ? data.intraop.positions as string[] : undefined,
    monitoring: selectedMonitoringFieldsFromRecord(monitoringOptions, data.intraop),
    preop: buildIntraopPreopSummary(data.preop, data.clinicalMode ?? "ADULT"),
    timing: {
      monthYear: data.intraop?.monthYear ?? defaultMonthYear(),
      startTime: trustedStart && timezone
        ? localTimeOf(trustedStart, timezone) ?? undefined
        : storedHHMM(data.intraop?.startTime),
      endTime: data.intraop?.endedAt && timezone
        ? localTimeOf(new Date(data.intraop.endedAt), timezone) ?? undefined
        : storedHHMM(data.intraop?.endTime),
      endTimeNextDay: data.intraop?.endTimeNextDay != null ? !!data.intraop.endTimeNextDay : undefined,
      timezone,
    },
    airway: {
      tools: Array.isArray(data.intraop?.airwayTools) ? data.intraop.airwayTools as string[] : undefined,
      devices: Array.isArray(data.intraop?.airwayDevices) ? data.intraop.airwayDevices as string[] : undefined,
      lmaSize: data.intraop?.lmaSize != null ? String(data.intraop.lmaSize) : undefined,
      oralTubeSize: data.intraop?.oralTubeSize != null ? String(data.intraop.oralTubeSize) : undefined,
      oralCuffed: data.intraop?.oralCuffed != null ? !!data.intraop.oralCuffed : undefined,
      nasalTubeSize: data.intraop?.nasalTubeSize != null ? String(data.intraop.nasalTubeSize) : undefined,
      nasalCuffed: data.intraop?.nasalCuffed != null ? !!data.intraop.nasalCuffed : undefined,
      dltType: data.intraop?.dltType != null ? data.intraop.dltType as "Carlens" | "Robertshaw" : undefined,
      dltSide: data.intraop?.dltSide != null ? data.intraop.dltSide as "Left" | "Right" : undefined,
      dltSize: data.intraop?.dltSize != null ? Number(data.intraop.dltSize) : undefined,
      ebSize: data.intraop?.endobronchialSize != null ? Number(data.intraop.endobronchialSize) : undefined,
      clGrade: data.intraop?.cormackLehane != null ? data.intraop.cormackLehane as string : undefined,
      ventilationModes,
      ventilationExpanded: ventilationModes ? expandedVentilationPanelForModes(ventilationModes) : undefined,
      notes: data.intraop?.airwayNotes != null ? data.intraop.airwayNotes as string : undefined,
    },
    hasAdvancedMonitoring: hasAdvancedMonitoringSelected(monitoringOptions, data.intraop),
    vascularAccesses: Array.isArray(data.intraop?.vascularAccesses) ? data.intraop.vascularAccesses as VascularEntry[] : undefined,
    premedication: {
      evening: data.intraop?.premedicationEvening != null ? data.intraop.premedicationEvening as string : undefined,
      morning: data.intraop?.premedicationMorning != null ? data.intraop.premedicationMorning as string : undefined,
    },
    complications,
    loadedTimetable,
    active: rebuildActiveState([...rawLog].reverse()),
  }
}
