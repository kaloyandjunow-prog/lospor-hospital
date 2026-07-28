import { formatHHMM } from "@/lib/intraop-format"
import { activeTechniquesForCase, isGeneralAnesthesiaCase } from "@/lib/intraop-monitoring-defaults"
import { latestVitalEvent, previousVitalAfterIndex, vitalFieldVisibility } from "@/lib/intraop-vital-log"
import type { LogEvent } from "@/lib/intraop-log-event"

type CaseInfo = {
  techniques?: string[]
} | null

export function useIntraopClinicalViewState(
  log: LogEvent[],
  techniques: string[],
  caseInfo: CaseInfo,
  monitoring: string[],
) {
  const lastVitals = latestVitalEvent(log)
  const now = new Date()
  const timeStr = formatHHMM(now)
  const activeTechniques = activeTechniquesForCase(techniques, caseInfo?.techniques)
  const isGACase = isGeneralAnesthesiaCase(activeTechniques)
  const vitalVisibility = vitalFieldVisibility(isGACase, monitoring)

  function prevVitalFor(idx: number): LogEvent | undefined {
    return previousVitalAfterIndex(log, idx)
  }

  return {
    lastVitals,
    timeStr,
    prevVitalFor,
    activeTechniques,
    isGACase,
    vitalVisibility,
  }
}
